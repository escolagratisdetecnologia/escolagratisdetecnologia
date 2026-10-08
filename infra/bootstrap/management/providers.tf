provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}

# Cost Explorer (anomalies and cost allocation tags) is served from us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}
