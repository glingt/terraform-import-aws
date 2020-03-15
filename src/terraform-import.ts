#!/usr/bin/env node

import { composite } from "terraform-state-in-typescript";
import { exec } from "child_process";
import { toTfFormat } from "./terraform-generator";
import * as AWS from "aws-sdk";
import * as fs from "fs";
import chalk from "chalk";
import { TerraformState } from "./terraform-state";
import * as yargs from "yargs";
import { descriptors } from "./descriptors/descriptors";

const doList = async () => {
  const state: TerraformState = JSON.parse(fs.readFileSync("./terraform.tfstate").toString());
  let numNewResources = 0;
  for (let i = 0; i < descriptors.length; i++) {
    const { type, fetcher, descriptor, matcher } = descriptors[i];
    const items = await fetcher();
    items.map(async item => {
      const description = descriptor(item);
      const existingResource = state.resources
        .filter(r => r.type === type)
        .find(r => r.instances.some(i => matcher(item, i)));
      if (existingResource) {
        console.log(chalk.bgGray(`${type}/${description.name}`));
      } else {
        console.log(chalk.green(`${type}/${description.name}`));
        numNewResources++;
      }
    });
  }
  if (numNewResources === 0) {
    console.log("Found 0 new resources to add.");
  } else {
    console.log(`Found ${numNewResources} new resources to add. Run import <resource> to import resources.`);
  }
};

const doImport = async (url: string) => {
  const [type, ...rest] = url.split("/");
  const identifier = rest.join("/");

  const descriptor = descriptors.find(d => d.type === type);
  if (!descriptor) {
    throw new Error("Illegal type: " + type);
  }
  console.log(chalk.yellow(`Importing ${type} ${identifier}...`));
  const resources = await descriptor.doImport(identifier);
  fs.writeFileSync("./imported.tf", toTfFormat(composite(...resources.map(r => r.resource))));

  resources.forEach(async v => {
    await new Promise((resolve, reject) =>
      exec(`terraform import ${v.resource.resourceType}.${v.resource.resourceId} ${v.name}`, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      }),
    ).catch(err =>
      console.log(chalk.red(`Resource could not be imported: ${v.resource.type}.${v.resource.resourceId}`)),
    );
  });
};

AWS.config.update({ region: "eu-west-1" });
yargs
  .scriptName("terraform-import")
  .usage("$0 <cmd> [args]")
  .command(
    "import [resource] [id]",
    "Imports a remote resource to your Terraform state",
    yargs => {
      yargs
        .positional("resource", {
          type: "string",
          demandOption: true,
          describe: "the identifier for the existing resource (for example aws_s3_bucket/mybucket)",
        })
        .positional("id", {
          type: "string",
          demandOption: false,
          describe: "the id for the created managed resource",
        });
    },
    async argv => {
      doImport("" + argv.resource);
    },
  )
  .command(
    "list",
    "List all remote resoruces",
    yargs => {
      yargs
        .positional("resource", {
          type: "string",
          demandOption: true,
          describe: "the identifier for the existing resource (for example aws_s3_bucket/mybucket)",
        })
        .positional("id", {
          type: "string",
          demandOption: false,
          describe: "the id for the created managed resource",
        });
    },
    () => doList(),
  )
  .strict()
  .help().argv;
