environment       = "prod"
state_bucket_name = "escolagratis-tfstate-prod"
zone_name         = "escolagratisdetecnologia.com"

# Fill with the `zone_name_servers` output of the dev bootstrap (docs/runbooks/bootstrap-aws.md).
subdomain_delegations = {
    "dev.escolagratisdetecnologia.com" = ["ns-1373.awsdns-43.org", "ns-1662.awsdns-15.co.uk", "ns-45.awsdns-05.com", "ns-799.awsdns-35.net"]
}
