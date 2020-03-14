#!/usr/bin/env node

console.log("Migrating...");

import * as AWS from "aws-sdk";
import * as fs from "fs";
import * as chalk from "chalk";
import { TerraformState } from "./terraform-state";
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

const doMigrate = async () => {
  var state: TerraformState = JSON.parse(fs.readFileSync("./terraform.tfstate").toString());

  const addResources = <T>(items: T[], descriptor: (t: T) => ResourceDescriptor) => {
    // TODO:
    // Loop through resources.
    // if (resource in state)
    // { do nothing }
    // else
    // {  }
    const result = items.map(item => {
      const description = descriptor(item);
      const existingResource = state.resources.find(r => r.name === description.name);
      if (existingResource) {
        console.log("Found existing resource: " + existingResource.name);
      } else {
        console.log(chalk.green("Found new resource: " + description.name));
      }
    });
    return result;
  };
  var apigateway = new AWS.APIGateway();

  const apis = await getAwsData<AWS.APIGateway.RestApis>(cb => apigateway.getRestApis({}, cb));

  addResources(apis.items || [], api => ({ name: api.name || "" }));

  const deployments = await getAwsData<AWS.APIGateway.Deployments>(cb =>
    apigateway.getDeployments({ restApiId: "zsjsr1o764" }, cb),
  );

  addResources(deployments.items || [], d => ({ name: d.id || "" }));
};

doMigrate();
