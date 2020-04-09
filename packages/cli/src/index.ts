#!/usr/bin/env node

import {
  AsyncQueue,
  startup,
  parseSQLFile,
  parseTypeScriptFile,
} from "@pgtyped/query";
import chokidar from "chokidar";
import * as Option from "fp-ts/lib/Option";
import fs from "fs";
import glob from "glob";
import minimist from "minimist";
import path from "path";
import {promisify} from "util";
import {
  IConfig, parseConfig,
} from "./config";
import {queryToTypeDeclarations} from "./generator";
import {assert, debug} from "./util";

const writeFile = promisify(fs.writeFile);

const args = minimist(process.argv.slice(2));

// tslint:disable:no-console
const helpMessage = `PostgreSQL type generator flags:
  -w --watch     Watch mode
  -h --help      Display this message
  -c             Config file (required)`;

interface ITypedQuery {
  fileName: string;
  queryName: string;
  typeDeclaration: string;
}


export enum ProcessingMode {
  SQL = 'sql-file',
  TS = 'query-file'
}

class FileProcessor {
  private mode: ProcessingMode;
  public emptyQueue: Promise<void>;
  private fileQueue: string[] = [];
  private activePromise: Promise<void> | null = null;
  private connection: any;

  constructor(connection: any, mode: ProcessingMode) {
    this.mode = mode;
    this.connection = connection;
    this.emptyQueue = new Promise((resolve, reject) => {
      this.resolveDone = resolve;
    });
  }

  public push(...fileNames: string[]) {
    this.fileQueue.push(...fileNames);
    this.processQueue();
    this.emptyQueue = new Promise((resolve, reject) => {
      this.resolveDone = resolve;
    });
  }

  private resolveDone: () => void = () => undefined;

  private onFileProcessed = () => {
    this.activePromise = null;
    this.processQueue();
  };

  private generateTypedecsFromFile = async (fileName: string, connection: any) => {
    const results: ITypedQuery[] = [];
    const contents = fs.readFileSync(fileName).toString();
    if (this.mode === ProcessingMode.TS) {
      const queries = parseTypeScriptFile(contents, fileName);
      for (const query of queries) {
        const result = await queryToTypeDeclarations(
          {body: query.tagContent, name: query.queryName, mode: ProcessingMode.TS},
          connection,
        );
        const typedQuery = ({
          fileName,
          queryName: query.queryName,
          typeDeclaration: result,
        });
        results.push(typedQuery);
      }
    } else {
      const {parseTree: {queries}} = parseSQLFile(contents, fileName);
      for (const query of queries) {
        const result = await queryToTypeDeclarations(
          {ast: query, mode: ProcessingMode.SQL},
          connection,
        );
        const typedQuery = ({
          fileName,
          queryName: query.name,
          typeDeclaration: result,
        });
        results.push(typedQuery);
      }
    }
    return results;
  };

  private async processFile(connection: any, fileName: string) {
    console.log(`Processing ${fileName}`);
    const ext = this.mode === ProcessingMode.TS ? "ts" : "sql";
    const decsFileName = path.resolve(
      path.dirname(fileName),
      path.basename(fileName, ext) + "types.ts",
    );
    const typeDecs = await this.generateTypedecsFromFile(fileName, connection);
    if (typeDecs.length === 0) {
      return;
    }
    let declarationFileContents = `/** Types generated for queries found in "${fileName}" */\n\n`;
    for (const typeDec of typeDecs) {
      declarationFileContents += typeDec.typeDeclaration + "\n";
    }
    await writeFile(decsFileName, declarationFileContents);
    console.log(`Saved ${typeDecs.length} query types to ${path.relative(process.cwd(), decsFileName)}`);
  }

  private processQueue = () => {
    if (this.activePromise) {
      this.activePromise.then(this.onFileProcessed);
      return;
    }
    const nextFile = this.fileQueue.pop();
    if (nextFile) {
      this.activePromise = this.processFile(this.connection, nextFile)
        .then(this.onFileProcessed);
    } else {
      this.resolveDone();
    }
  }
}

async function main(config: IConfig, isWatchMode: boolean) {
  const {emit: emitMode} = config;

  const connection = new AsyncQueue();
  debug("starting codegenerator");
  await startup({
    host: config.db.host,
    user: config.db.user,
    database: config.db.dbName,
    password: config.db.password,
  }, connection);

  debug("connected to database %o", config.db.dbName);

  let pattern;
  if (emitMode.mode === "query-file") {
    pattern = `${config.srcDir}/**/${emitMode.queryFileName}`;
  }
  if (emitMode.mode === "sql-file") {
    pattern = emitMode.pattern;
  }

  assert(pattern);
  const fileProcessor = new FileProcessor(connection, emitMode.mode as ProcessingMode);

  if (isWatchMode) {
    chokidar.watch(pattern, {persistent: true})
      .on("add", (filePath) => fileProcessor.push(filePath))
      .on("change", (filePath) => fileProcessor.push(filePath));
    return;
  }

  const fileList = glob.sync(pattern);
  debug("found query files %o", fileList);
  fileProcessor.push(...fileList);
  await fileProcessor.emptyQueue;

  process.exit(0);
}

if (require.main === module) {
  if (args.h || args.help) {
    console.log(helpMessage);
    process.exit(0);
  }

  const {
    c: configPath,
    w: isWatchMode,
  } = args;

  if (typeof configPath !== "string") {
    console.log("Config file required. See help -h for details.\nExiting.");
    process.exit(0);
  }

  const configResult = parseConfig(configPath);

  if (Option.isNone(configResult)) {
    console.log("Config file parsing failed.");
    process.exit();
  } else {
    main(configResult.value, isWatchMode).catch((e) => debug("error in main: %o", e.message));
  }
}
