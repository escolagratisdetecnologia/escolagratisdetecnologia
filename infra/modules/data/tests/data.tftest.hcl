mock_provider "aws" {}

variables {
  name_prefix = "egt-test"
}

run "single_table" {
  command = plan

  assert {
    condition     = aws_dynamodb_table.main.name == "egt-test-data-main"
    error_message = "Nome da tabela inesperado."
  }

  assert {
    condition     = aws_dynamodb_table.main.billing_mode == "PAY_PER_REQUEST"
    error_message = "A tabela deve ser sob demanda."
  }

  assert {
    condition     = aws_dynamodb_table.main.hash_key == "PK" && aws_dynamodb_table.main.range_key == "SK"
    error_message = "Chaves devem ser PK e SK (packages/db/src/table.ts)."
  }

  assert {
    condition     = one(aws_dynamodb_table.main.global_secondary_index).name == "GSI1"
    error_message = "Esperado o índice GSI1."
  }

  assert {
    condition     = one(aws_dynamodb_table.main.point_in_time_recovery).enabled
    error_message = "PITR deve estar ligado."
  }

  assert {
    condition     = one(aws_dynamodb_table.main.ttl).attribute_name == "ttl"
    error_message = "TTL deve usar o atributo ttl."
  }

  assert {
    condition     = aws_dynamodb_table.main.deletion_protection_enabled
    error_message = "Proteção contra exclusão deve vir ligada por padrão."
  }

  assert {
    condition     = aws_dynamodb_table.main.tags["DataClassification"] == "personal" && aws_dynamodb_table.main.tags["Component"] == "data"
    error_message = "Tags Component=data e DataClassification=personal são obrigatórias."
  }
}

run "without_deletion_protection" {
  command = plan

  variables {
    deletion_protection = false
  }

  assert {
    condition     = !aws_dynamodb_table.main.deletion_protection_enabled
    error_message = "deletion_protection = false deve desligar a proteção."
  }
}
