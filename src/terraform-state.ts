interface Resource {
  mode: "managed";
  type: "aws_acm_certificate" | string;
  name: string;
  provider: string;
}

export interface TerraformState {
  resources: Resource[];
}
