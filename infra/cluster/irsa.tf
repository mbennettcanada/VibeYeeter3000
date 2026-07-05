# IRSA roles for the two in-cluster services that talk to AWS directly.
# Each service account binds to its role via the
# `eks.amazonaws.com/role-arn` annotation set on the ServiceAccount in
# k8s/platform (not managed here).

data "aws_caller_identity" "current" {}

# apps/api: read/write app secrets under the vibeyeeter/<appId>/* prefix.
data "aws_iam_policy_document" "platform_api_secrets" {
  statement {
    sid = "SecretsManagerAppSecrets"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:PutSecretValue",
      "secretsmanager:CreateSecret",
      "secretsmanager:DeleteSecret",
      "secretsmanager:DescribeSecret",
      "secretsmanager:ListSecrets",
      "secretsmanager:TagResource",
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:vibeyeeter/*",
    ]
  }
}

resource "aws_iam_policy" "platform_api_secrets" {
  name   = "${var.cluster_name}-platform-api-secrets"
  policy = data.aws_iam_policy_document.platform_api_secrets.json
  tags   = var.tags
}

module "platform_api_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${var.cluster_name}-platform-api"

  role_policy_arns = {
    secrets = aws_iam_policy.platform_api_secrets.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["vibeyeeter-system:platform-api"]
    }
  }

  tags = var.tags
}

# services/tf-runner: read/write OpenTofu remote state (S3) and locks
# (DynamoDB) for managed-app Terraform runs.
data "aws_iam_policy_document" "tf_runner_state" {
  statement {
    sid = "TfStateBucket"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::vibeyeeter-tfstate",
      "arn:aws:s3:::vibeyeeter-tfstate/*",
    ]
  }

  statement {
    sid = "TfLockTable"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]
    resources = [
      "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/vibeyeeter-tf-locks",
    ]
  }
}

resource "aws_iam_policy" "tf_runner_state" {
  name   = "${var.cluster_name}-tf-runner-state"
  policy = data.aws_iam_policy_document.tf_runner_state.json
  tags   = var.tags
}

module "tf_runner_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${var.cluster_name}-tf-runner"

  role_policy_arns = {
    state = aws_iam_policy.tf_runner_state.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["vibeyeeter-system:tf-runner"]
    }
  }

  tags = var.tags
}
