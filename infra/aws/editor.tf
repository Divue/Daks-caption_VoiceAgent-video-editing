# The editor as a Lambda Function URL - see editor_site/handler.py for why. Package it first: package_editor.py.

resource "aws_iam_role" "editor" {
  name = "${var.name}-editor"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "editor_logs" {
  role       = aws_iam_role.editor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "editor" {
  name              = "/aws/lambda/${var.name}-editor"
  retention_in_days = 7
}

resource "aws_lambda_function" "editor" {
  function_name    = "${var.name}-editor"
  role             = aws_iam_role.editor.arn
  runtime          = "python3.12"
  handler          = "handler.handler"
  filename         = "${path.module}/editor.zip"
  source_code_hash = filebase64sha256("${path.module}/editor.zip")
  memory_size      = 256
  timeout          = 10

  depends_on = [aws_cloudwatch_log_group.editor, aws_iam_role_policy_attachment.editor_logs]
}

resource "aws_lambda_function_url" "editor" {
  function_name      = aws_lambda_function.editor.function_name
  authorization_type = "NONE"
}

# A public Function URL needs BOTH permissions (AWS changed this in late 2025): invoke-via-URL and invoke.
resource "aws_lambda_permission" "editor_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.editor.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "editor_invoke" {
  statement_id             = "AllowInvokeViaFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.editor.function_name
  principal                = "*"
  invoked_via_function_url = true
}
