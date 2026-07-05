# State for the platform's own cluster infra. Bootstrap this bucket/table
# once, out of band, before running `tofu init` here — this config does not
# create its own backend.
terraform {
  backend "s3" {
    bucket         = "vibeyeeter-tfstate"
    key            = "cluster/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "vibeyeeter-tf-locks"
    encrypt        = true
  }
}
