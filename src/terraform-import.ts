#!/usr/bin/env node

import { composite, createFileContent, resource, ResourceElement } from "terraform-state-in-typescript";
import { exec } from "child_process";
import * as AWS from "aws-sdk";
import * as fs from "fs";
import chalk from "chalk";
import { TerraformState } from "./terraform-state";
import * as yargs from "yargs";
import { descriptors, ImportResult } from "./descriptors/descriptors";

interface ResourceInfo {
  type: string;
  identifier: string | undefined;
}

const asyncForEach = async <T>(arr: T[], fn: (t: T) => Promise<void>) => {
  for (let i = 0; i < arr.length; i++) {
    await fn(arr[i]);
  }
};

const asyncReduce = async <Aggr, T>(arr: T[], fn: (ag: Aggr, t: T) => Promise<Aggr>, a0: Aggr) => {
  let a = a0;
  await asyncForEach(arr, async elem => {
    a = await fn(a, elem);
  });
  return a;
};

const getResources = async (): Promise<ResourceInfo[]> => {
  const state: TerraformState = JSON.parse(fs.readFileSync("./terraform.tfstate").toString());
  const resources: ResourceInfo[] = [];
  await asyncForEach(descriptors, async d => {
    const { type, fetcher, descriptor, matcher } = d;
    const items = await fetcher();
    await asyncForEach(items, async item => {
      const description = descriptor(item);
      const existingResource = state.resources
        .filter(r => r.type === type)
        .find(r => r.instances.some(i => matcher(item, i)));
      if (existingResource) {
      } else {
        resources.push({ type, identifier: description.identifier });
      }
    });
  });
  return resources;
};

const importResources = async (resources: ResourceInfo[]) => {
  const imports = await asyncReduce<ImportResult[], ResourceInfo>(
    resources,
    async (allResources: ImportResult[], r: ResourceInfo) => {
      const descriptor = descriptors.find(d => d.type === r.type);
      if (!descriptor) {
        throw new Error("Illegal type: " + r.type);
      }
      if (!r.identifier) {
        throw new Error("Illegal identifier: " + r.identifier);
      }
      console.log(chalk.yellow(`Importing ${r.type} ${r.identifier}...`));
      const result = await descriptor.doImport(r.identifier);
      return [...allResources, ...result];
    },
    [],
  );

  const getFile = (r: ResourceElement) => `./${r.resourceType} ${r.resourceId}.tf`;

  imports.forEach(v => {
    fs.writeFileSync(getFile(v.resource), createFileContent(v.resource));
  });

  await asyncForEach(imports, v =>
    new Promise((resolve, reject) =>
      exec(`terraform import ${v.resource.resourceType}.${v.resource.resourceId} ${v.name}`, (err, data) => {
        if (err) {
          fs.unlinkSync(getFile(v.resource));
          reject(err);
        } else {
          resolve(data);
        }
      }),
    )
      .then(() => {})
      .catch(err => {
        console.error(err);
        console.log(chalk.red(`Resource could not be imported: ${v.resource.resourceType}.${v.resource.resourceId}`));
      }),
  );
};

const doList = async () => {
  const resources = await getResources();
  resources.forEach(resource => {
    console.log(chalk.green(`${resource.type}/${resource.identifier}`));
  });
  const numNewResources = resources.length;
  if (numNewResources === 0) {
    console.log("Found 0 new resources to add.");
  } else {
    console.log(`Found ${numNewResources} new resources to add. Run import <resource> to import resources.`);
  }
};

const doImport = async (url: string) => {
  const [type, ...rest] = url.split("/");
  const identifier = rest.join("/");

  await importResources([{ type, identifier }]);
};

const doImportAll = async () => {
  const resources = await getResources();
  await importResources(resources);
};

AWS.config.update({ region: "eu-west-1" });

yargs
  .scriptName("terraform-import")
  .usage("$0 <cmd> [args]")
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
    "import-all",
    "Imports all resources to terraform",
    yargs => {},
    async argv => {
      doImportAll();
    },
  )
  .strict()
  .help().argv;
