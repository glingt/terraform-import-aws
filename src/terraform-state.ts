export interface TerraformInstance {
  schema_version: 0;
  attributes: { arn: string; id: string; name?: string };
  private: string;
}

export interface TerraformResource {
  mode: "managed";
  type: "aws_acm_certificate" | string;
  name: string;
  provider: string;
  instances: TerraformInstance[];
}

export interface TerraformState {
  resources: TerraformResource[];
}
