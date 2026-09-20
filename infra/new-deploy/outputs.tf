output "ecr_api" {
  value = aws_ecr_repository.repo["api"].repository_url
}

output "ecr_voice" {
  value = aws_ecr_repository.repo["voice"].repository_url
}

output "ecr_render" {
  value = aws_ecr_repository.repo["render"].repository_url
}

output "api_url" {
  description = "Build the editor image with VITE_API_URL set to this. Empty until deploy_services = true."
  value       = var.deploy_services ? "https://${aws_apprunner_service.api[0].service_url}" : ""
}

output "editor_url" {
  description = "The public editor (Lambda Function URL). Also the origin the media bucket CORS must allow."
  value       = trimsuffix(aws_lambda_function_url.editor.function_url, "/")
}

output "render_alb" {
  value = aws_lb.render.dns_name
}
