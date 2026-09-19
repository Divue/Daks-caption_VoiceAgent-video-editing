output "ecr_repository_url" {
  description = "Push the API image here."
  value       = aws_ecr_repository.api.repository_url
}

output "voice_ecr_repository_url" {
  description = "Push the voice worker image here."
  value       = aws_ecr_repository.voice.repository_url
}

output "editor_url" {
  description = "The public editor (existing Amplify app). Also the origin the S3 media bucket CORS must allow."
  value       = var.editor_url
}

output "api_url" {
  description = "Use as VITE_API_URL on the Amplify app. Empty until deploy_api = true."
  value       = var.deploy_api ? "https://${aws_apprunner_service.api[0].service_url}" : ""
}
