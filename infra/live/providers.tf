provider "aws" {
  region = "sa-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = module.tags.default_tags
  }
}
