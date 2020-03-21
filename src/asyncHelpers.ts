import { exec } from "child_process";

export const asyncForEach = async <T>(arr: T[], fn: (t: T) => Promise<void>) => {
  for (let i = 0; i < arr.length; i++) {
    await fn(arr[i]);
  }
};

export const asyncReduce = async <Aggr, T>(arr: T[], fn: (ag: Aggr, t: T) => Promise<Aggr>, a0: Aggr) => {
  let a = a0;
  await asyncForEach(arr, async elem => {
    a = await fn(a, elem);
  });
  return a;
};

export const asyncExec = async (cmd: string) =>
  new Promise((resolve, reject) =>
    exec(cmd, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    }),
  );
