// deno-lint-ignore-file no-explicit-any
import { colors, Command, Folder, FolderService, log, Table } from "./deps.ts";
import { requireLogin, resolveWorkspace, validatePath } from "./context.ts";
import { GlobalOptions, isSuperset, parseFromFile } from "./types.ts";

export interface FolderFile {
  owners: Array<string> | undefined;
  extra_perms: Map<string, boolean> | undefined;
  display_name: string | undefined;
}

async function list(opts: GlobalOptions) {
  const workspace = await resolveWorkspace(opts);
  await requireLogin(opts);

  const folders = await FolderService.listFolders({
    workspace: workspace.workspaceId,
  });

  new Table()
    .header(["Name", "Owners", "Extra Perms"])
    .padding(2)
    .border(true)
    .body(
      folders.map((x) => [
        x.name,
        x.owners?.join(",") ?? "-",
        JSON.stringify(x.extra_perms ?? {}),
      ])
    )
    .render();
}

export async function pushFolder(
  workspace: string,
  name: string,
  folder: Folder | FolderFile | undefined,
  localFolder: FolderFile,
  raw: boolean
): Promise<void> {
  if (name.startsWith("/")) {
    name = name.substring(1);
  }
  if (name.startsWith("f/")) {
    name = name.substring(2);
  }
  name = name.split("/")[0];
  log.debug(`Processing local folder ${name}`);

  if (raw) {
    // deleting old app if it exists in raw mode
    try {
      folder = await FolderService.getFolder({ workspace, name });
      log.debug(`Folder ${name} exists on remote`);
    } catch {
      log.debug(`Folder ${name} does not exist on remote`);
      //ignore
    }
  }

  if (folder) {
    if (isSuperset(localFolder, folder)) {
      log.debug(`Folder ${name} is up to date`);
      return;
    }
    log.debug(`Folder ${name} is not up-to-date, updating...`);
    await FolderService.updateFolder({
      workspace: workspace,
      name: name,
      requestBody: {
        ...localFolder,
      },
    });
  } else {
    console.log(colors.bold.yellow("Creating new folder: " + name));
    await FolderService.createFolder({
      workspace: workspace,
      requestBody: {
        name: name,
        ...localFolder,
      },
    });
  }
}

async function push(opts: GlobalOptions, filePath: string, remotePath: string) {
  const workspace = await resolveWorkspace(opts);
  await requireLogin(opts);

  if (!validatePath(remotePath)) {
    return;
  }

  const fstat = await Deno.stat(filePath);
  if (!fstat.isFile) {
    throw new Error("file path must refer to a file.");
  }

  console.log(colors.bold.yellow("Pushing folder..."));

  await pushFolder(
    workspace.workspaceId,
    remotePath,
    undefined,
    parseFromFile(filePath),
    false
  );
  console.log(colors.bold.underline.green("Folder pushed"));
}

const command = new Command()
  .description("folder related commands")
  .action(list as any)
  .command(
    "push",
    "push a local folder spec. This overrides any remote versions."
  )
  .arguments("<file_path:string> <remote_path:string>")
  .action(push as any);

export default command;
