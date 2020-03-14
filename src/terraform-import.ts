#!/usr/bin/env node

console.log("Migrating...");

import * as AWS from "aws-sdk";
import * as fs from "fs";
import chalk from "chalk";
import { TerraformState, TerraformResource, TerraformInstance } from "./terraform-state";
AWS.config.update({ region: "eu-west-1" });

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
  name: string;
}

interface ImportType<T> {
  type: string;
  fetcher: () => Promise<T[]>;
  descriptor: (t: T) => { name: string | undefined };
  matcher: (t: T, instance: TerraformInstance) => boolean;
  doImport: () => Promise<void>;
}

const doMigrate = async () => {
  const state: TerraformState = JSON.parse(fs.readFileSync("./terraform.tfstate").toString());

  const importTypes: ImportType<any>[] = [
    {
      type: "aws_api_gateway_rest_api",
      fetcher: async () => {
        const result = await getAwsData<AWS.APIGateway.RestApis>(cb => new AWS.APIGateway().getRestApis({}, cb));
        return result.items || [];
      },
      matcher: (api: AWS.APIGateway.RestApi, instance) => api.name === instance.attributes.name,
      descriptor: (api: AWS.APIGateway.RestApi) => ({ name: api.name }),
      doImport: async () => {
        const deployments = await getAwsData<AWS.APIGateway.Deployments>(cb =>
          new AWS.APIGateway().getDeployments({ restApiId: "zsjsr1o764" }, cb),
        );
        //addResources("aws_api_gateway_deployment", deployments.items || [], d => ({ name: d.id || "" }));
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
        const deployments = await getAwsData<AWS.APIGateway.Deployments>(cb =>
          new AWS.APIGateway().getDeployments({ restApiId: "zsjsr1o764" }, cb),
        );
        //addResources("aws_api_gateway_deployment", deployments.items || [], d => ({ name: d.id || "" }));
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
      doImport: async () => {},
    },
    {
      type: "aws_iam_role",
      fetcher: async () => {
        const result = await getAwsData<AWS.IAM.ListRolesResponse>(cb => new AWS.IAM().listRoles(cb));
        return result.Roles || [];
      },
      matcher: (role: AWS.IAM.Role, instance) => role.RoleName === instance.attributes.id,
      descriptor: (role: AWS.IAM.Role) => ({ name: role.RoleName }),
      doImport: async () => {},
    },
  ];

  for (let i = 0; i < importTypes.length; i++) {
    const { type, fetcher, descriptor, matcher } = importTypes[i];
    const items = await fetcher();
    items.map(item => {
      const description = descriptor(item);
      const existingResource = state.resources
        .filter(r => r.type === type)
        .find(r => r.instances.some(i => matcher(item, i)));
      if (existingResource) {
        console.log(chalk.bgGray(`${type}.${description.name}`));
      } else {
        console.log(chalk.green(`${type}.${description.name}`));
      }
    });
  }
};

doMigrate();
