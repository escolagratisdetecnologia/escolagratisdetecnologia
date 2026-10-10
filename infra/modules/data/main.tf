locals {
  tags = { Component = "data", DataClassification = "personal" }
}

# Single table (ADR 0006) with generic keys, modeled with ElectroDB in packages/db; keep the key
# schema in sync with packages/db/src/table.ts. Encrypted at rest with the AWS owned key (no
# cost); point-in-time recovery keeps 35 days of history.
resource "aws_dynamodb_table" "main" {
  name                        = "${var.name_prefix}-data-main"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "PK"
  range_key                   = "SK"
  deletion_protection_enabled = var.deletion_protection
  tags                        = local.tags

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}
