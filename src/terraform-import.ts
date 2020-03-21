#!/usr/bin/env node

import { createFileContent, ResourceElement } from "terraform-state-in-typescript";

import * as fs from "fs";
import chalk from "chalk";
import { TerraformState } from "./terraform-state";
import * as yargs from "yargs";
import { descriptors, ImportResult } from "./descriptors/descriptors";
import { asyncForEach, asyncReduce, asyncExec } from "./asyncHelpers";

interface ResourceInfo {
  type: string;
  identifier: string | undefined;
}

interface LogOptions {
  verbose: boolean;
}

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

const importResources = async (resources: ResourceInfo[], options: LogOptions) => {
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

  await asyncForEach(imports, async v => {
    const filename = getFile(v.resource);
    fs.writeFileSync(filename, createFileContent(v.resource));
    try {
      await asyncExec(`terraform import ${v.resource.resourceType}.${v.resource.resourceId} ${v.name}`);
    } catch (err) {
      if (options.verbose) {
        console.error(err);
      }
      options.verbose ? fs.renameSync(filename, filename + ".error.txt") : fs.unlinkSync(getFile(v.resource));
      console.log(
        chalk.red(`Resource could not be imported: ${v.resource.resourceType}.${v.resource.resourceId}: ${err}`),
      );
    }
  });
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

const doImport = async (url: string, options: LogOptions) => {
  const [type, ...rest] = url.split("/");
  const identifier = rest.join("/");

  await importResources([{ type, identifier }], options);
};

const doImportAll = async (options: LogOptions) => {
  const resources = await getResources();
  await importResources(resources, options);
};

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
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          default: false,
          description: "Run with verbose logging",
        });
    },
    async argv => {
      doImport("" + argv.resource, { verbose: !!argv.verbose });
    },
  )
  .command(
    "import-all",
    "Imports all resources to terraform",
    yargs => {},
    async argv => {
      doImportAll({ verbose: !!argv.options });
    },
  )
  .strict()
  .help().argv;
