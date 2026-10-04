# Input validation only: mocked providers, plan-only, no AWS access.
mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

# The root adopts the bucket with an import block, which mocks cannot import.
override_resource {
  target = module.state_bucket.aws_s3_bucket.this
  values = {
    arn = "arn:aws:s3:::escolagratis-tfstate-management"
  }
}

override_data {
  target = module.state_bucket.data.aws_iam_policy_document.tls_only
  values = {
    json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }
}

variables {
  state_bucket_name = "escolagratis-tfstate-management"
}

run "accepts_twelve_digit_account_ids" {
  command = plan

  variables {
    member_account_ids = { dev = "111111111111", prod = "222222222222" }
  }
}

run "rejects_non_account_ids" {
  command = plan

  variables {
    member_account_ids = { dev = "r-abcd" }
  }

  expect_failures = [var.member_account_ids]
}
