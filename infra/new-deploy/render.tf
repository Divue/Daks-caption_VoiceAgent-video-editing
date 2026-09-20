# The Remotion render server (remotion/server) on Fargate, reachable only through an INTERNAL ALB.
# It has no auth and fetches whatever URL it is given, so it must never be public.

resource "aws_cloudwatch_log_group" "render" {
  name              = "/ecs/${var.name}-render"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  name = var.name
}

resource "aws_lb" "render" {
  name               = "${var.name}-render"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.render_alb.id]
  subnets            = aws_subnet.private[*].id
  # MUST stay below Node's default keep-alive timeout (5 s) on the render server. If the ALB keeps an idle connection
  # longer than Node does, it reuses a socket Node already closed and answers the caller with a 502 (seen once in ~25
  # status polls). Nothing here is slow-idle: status calls answer at once and the MP4 stream sends data continuously.
  idle_timeout = 4
}

resource "aws_lb_target_group" "render" {
  name                 = "${var.name}-render"
  port                 = 3100
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30

  # LENIENT on purpose. The server bundles the composition on its own event loop at start-up (20-40 s, longer
  # on the very first run) and /health does not answer meanwhile. A strict check would mark the task unhealthy
  # and ECS would kill it mid-boot or mid-render (render state lives in memory and would be lost).
  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 10
    matcher             = "200"
  }
}

resource "aws_lb_listener" "render" {
  load_balancer_arn = aws_lb.render.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.render.arn
  }
}

resource "aws_ecs_task_definition" "render" {
  count                    = var.deploy_services ? 1 : 0
  family                   = "${var.name}-render"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "2048"
  memory                   = "4096" # a Chromium render needs 1-2 GB; two frames in flight (RENDER_CONCURRENCY=2)
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "render"
    image        = "${aws_ecr_repository.repo["render"].repository_url}:${var.render_image_tag}"
    essential    = true
    portMappings = [{ containerPort = 3100, protocol = "tcp" }]
    environment = [
      { name = "RENDER_HOST", value = "0.0.0.0" },
      { name = "RENDER_PORT", value = "3100" },
      { name = "RENDER_CONCURRENCY", value = "2" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.render.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "render"
      }
    }
  }])
}

resource "aws_ecs_service" "render" {
  count           = var.deploy_services ? 1 : 0
  name            = "${var.name}-render"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.render[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # The first start downloads nothing (Chrome is baked into the image) but still bundles for ~30-60 s.
  health_check_grace_period_seconds  = 300
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.render_task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.render.arn
    container_name   = "render"
    container_port   = 3100
  }

  depends_on = [aws_lb_listener.render, aws_iam_role_policy_attachment.ecs_execution, aws_route.private_nat]
}
