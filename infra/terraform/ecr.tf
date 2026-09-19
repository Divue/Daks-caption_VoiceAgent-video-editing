resource "aws_ecr_repository" "api" {
  name                 = "expressive-captions-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # lets `terraform destroy` remove the repo even with images in it

  image_scanning_configuration {
    scan_on_push = false
  }
}

# Keep the repo small: only the 5 most recent images.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
