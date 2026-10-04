run "dev_tags" {
  command = plan

  variables {
    environment = "dev"
  }

  assert {
    condition = output.default_tags == {
      Project     = "escola-gratis-de-tecnologia"
      Environment = "dev"
      ManagedBy   = "terraform"
      Repository  = "github.com/escolagratisdetecnologia/escolagratisdetecnologia"
    }
    error_message = "default_tags fora do padrão para dev."
  }

  assert {
    condition     = output.name_prefix == "egt-dev"
    error_message = "name_prefix deveria ser egt-dev."
  }
}

run "shared_environment_is_allowed" {
  command = plan

  variables {
    environment = "shared"
  }

  assert {
    condition     = output.default_tags.Environment == "shared"
    error_message = "shared deveria ser aceito para a conta de gerenciamento."
  }
}

run "rejects_unknown_environment" {
  command = plan

  variables {
    environment = "staging"
  }

  expect_failures = [var.environment]
}
