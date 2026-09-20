# Why a new VPC at all: the Remotion render server has no auth and must not be public, so the API has to
# reach it privately. App Runner can only do that through a VPC connector — and a VPC connector sends ALL of
# the API's outbound traffic through the VPC. So the private subnets need a NAT gateway or the API could not
# reach S3, DynamoDB, Bedrock or Transcribe any more. (~$0.045/h + data; accepted, see the audit.)

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = var.name }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = "10.20.${count.index}.0/24"
  tags              = { Name = "${var.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = "10.20.${10 + count.index}.0/24"
  tags              = { Name = "${var.name}-private-${count.index}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.name}-nat" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = var.name }
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name}-private" }
}

resource "aws_route" "private_nat" {
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ---- Security groups. The chain is: API (VPC connector) -> internal ALB :80 -> render task :3100.
# Nothing else can reach the render server, which is the whole point of this VPC.

resource "aws_security_group" "api_connector" {
  name        = "${var.name}-api-connector"
  description = "App Runner API egress into the VPC"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "S3, DynamoDB, Bedrock, Transcribe, the render ALB (via NAT / VPC)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "render_alb" {
  name        = "${var.name}-render-alb"
  description = "Internal ALB in front of the render server; only the API may call it"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTP from the API VPC connector"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.api_connector.id]
  }

  egress {
    description = "to the render task"
    from_port   = 3100
    to_port     = 3100
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
}

resource "aws_security_group" "render_task" {
  name        = "${var.name}-render-task"
  description = "Render server: inbound only from its ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "from the ALB"
    from_port       = 3100
    to_port         = 3100
    protocol        = "tcp"
    security_groups = [aws_security_group.render_alb.id]
  }

  egress {
    description = "presigned S3 video, Google Fonts, ECR, CloudWatch (via NAT)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "voice_task" {
  name        = "${var.name}-voice-task"
  description = "Voice worker: outbound only, no inbound"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "LiveKit Cloud, Transcribe streaming, ECR, CloudWatch (via NAT)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
