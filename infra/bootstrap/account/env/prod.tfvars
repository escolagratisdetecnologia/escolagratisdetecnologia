environment       = "prod"
state_bucket_name = "escolagratis-tfstate-prod"
zone_name         = "escolagratisdetecnologia.com"

# Main domain of the site since ADR 0020; the zone above stays for redirects and the dev delegation.
additional_zone_names = ["escolagratisdetecnologia.com.br"]

# Fill with the `zone_name_servers` output of the dev bootstrap (docs/runbooks/bootstrap-aws.md).
subdomain_delegations = {
  "dev.escolagratisdetecnologia.com" = ["ns-1373.awsdns-43.org", "ns-1662.awsdns-15.co.uk", "ns-45.awsdns-05.com", "ns-799.awsdns-35.net"]
}
