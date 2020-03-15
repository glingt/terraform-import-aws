import { TerraformInstance } from "../terraform-state";
import * as AWS from "aws-sdk";
import { resource, ResourceElement } from "terraform-state-in-typescript";

type AWSResult<T> = { err?: AWS.AWSError; data?: T };
type AWSCallback<T> = (err: AWS.AWSError, data: T) => void;

const getAwsData = <T>(gen: (callback: AWSCallback<T>) => void) =>
  new Promise<AWSResult<T>>(resolve => gen((err, data) => resolve({ err, data }))).then(getResult);

const getResult = <T>(result: AWSResult<T>) => {
  if (!result.data) {
    throw result.err;
  }
  return result.data;
};

interface ResourceDescriptor {
  name: string | undefined;
}

interface ImportType<T> {
  type: string;
  fetcher: () => Promise<T[]>;
  descriptor: (t: T) => ResourceDescriptor;
  matcher: (t: T, instance: TerraformInstance) => boolean;
  doImport: (identifier: string) => Promise<ImportResult[]>;
}

interface ImportResult {
  name: string;
  resource: ResourceElement;
}

export const descriptors: ImportType<any>[] = [
  {
    type: "aws_api_gateway_rest_api",
    fetcher: async () => {
      const result = await getAwsData<AWS.APIGateway.RestApis>(cb => new AWS.APIGateway().getRestApis({}, cb));
      return result.items || [];
    },
    matcher: (api: AWS.APIGateway.RestApi, instance) => api.name === instance.attributes.name,
    descriptor: (api: AWS.APIGateway.RestApi) => ({ name: api.name }),
    doImport: async () => {
      throw new Error("Not implemented");
    },
  },
  {
    type: "aws_route53_zone",
    fetcher: async () => {
      const result = await getAwsData<AWS.Route53.ListHostedZonesResponse>(cb =>
        new AWS.Route53().listHostedZones({}, cb),
      );
      return result.HostedZones || [];
    },
    matcher: (zone: AWS.Route53.HostedZone, instance) => zone.Name === instance.attributes.name,
    descriptor: (zone: AWS.Route53.HostedZone) => ({ name: zone.Name }),
    doImport: async () => {
      throw new Error("Not implemented");
    },
  },
  {
    type: "aws_s3_bucket",
    fetcher: async () => {
      const result = await getAwsData<AWS.S3.ListBucketsOutput>(cb => new AWS.S3().listBuckets(cb));
      return result.Buckets || [];
    },
    matcher: (bucket: AWS.S3.Bucket, instance) => bucket.Name === instance.attributes.id,
    descriptor: (bucket: AWS.S3.Bucket) => ({ name: bucket.Name }),
    doImport: async (identifier: string) => {
      const result = await getAwsData<AWS.S3.ListBucketsOutput>(cb => new AWS.S3().getBucketAcl(cb));
      return [];
    },
  },
  {
    type: "aws_iam_role",
    fetcher: async () => {
      const result = await getAwsData<AWS.IAM.ListRolesResponse>(cb => new AWS.IAM().listRoles(cb));
      return result.Roles || [];
    },
    matcher: (role: AWS.IAM.Role, instance) => role.RoleName === instance.attributes.id,
    descriptor: (role: AWS.IAM.Role) => ({ name: role.RoleName }),
    doImport: async (identifier: string) => {
      const result = await getAwsData<AWS.IAM.GetRoleResponse>(cb =>
        new AWS.IAM().getRole({ RoleName: identifier }, cb),
      );
      const role = result.Role;
      return [
        {
          name: role.RoleName,
          resource: resource("aws_iam_role", role.RoleName, {
            assume_role_policy: role.AssumeRolePolicyDocument,
          }),
        },
      ];
    },
  },
];
