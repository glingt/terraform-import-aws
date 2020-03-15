import { TerraformElement } from "terraform-state-in-typescript";

export const toTfFormat = (resource: TerraformElement): string => {
  switch (resource.type) {
    case "composite":
      return resource.elements.map(toTfFormat).join("\r\n\r\n");
    case "resource":
      return [`resource ${resource.resourceType} ${resource.resourceId} {`, `}`].join("\r\n");
    case "var":
      return "user_var {}";
  }
};
