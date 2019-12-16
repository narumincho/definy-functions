import * as g from "graphql";
import { URL } from "url";
import * as crypto from "crypto";
import * as firestoreType from "definy-firestore-type";

/*  =============================================================
                        SocialLoginService
    =============================================================
*/
const socialLoginServiceValues = {
  google: {
    description: "Google https://developers.google.com/identity/sign-in/web/"
  },
  gitHub: {
    description:
      "GitHub https://developer.github.com/v3/guides/basics-of-authentication/"
  },
  line: {
    description: "LINE https://developers.line.biz/ja/docs/line-login/"
  }
};

export const logInServiceGraphQLType = new g.GraphQLEnumType({
  name: "SocialLoginService",
  values: socialLoginServiceValues,
  description: "ソーシャルログインを提供するサービス"
});

/*  =============================================================
                            Commit
    =============================================================
*/

const kernelTypeValues: {
  [key in firestoreType.KernelType]: { description: string };
} = {
  float64: {
    description: "64bit の Float"
  },
  string: {
    description: "文字列"
  },
  array: {
    description: "JavaScriptのArray"
  },
  function: {
    description: "JavaScriptのFunction"
  }
};

export const kernelTypeGraphQLType = new g.GraphQLEnumType({
  name: "KernelType",
  description: "内部で表現された型",
  values: kernelTypeValues
});
const kernelTermValues: {
  [key in firestoreType.KernelTerm]: { description: string };
} = {
  add: {
    description: "+"
  },
  sub: {
    description: "-"
  },
  mul: {
    description: "*"
  },
  div: {
    description: "/"
  }
};

export const kernelTermGraphQLType = new g.GraphQLEnumType({
  name: "KernelTerm",
  description: "内部で表現された項",
  values: kernelTermValues
});
/*  =============================================================
                            Label
    =============================================================
*/

export const labelFromString = (text: string): firestoreType.Label => {
  if (text.length < 1) {
    throw new Error(`Label is empty. Label length must be 1～63`);
  }
  if (63 < text.length) {
    throw new Error(
      `Label(=${text}) length is ${text.length}. too long. Label length must be 1～63`
    );
  }
  if (!"abcdefghijklmnopqrstuvwxyz".includes(text[0])) {
    throw new Error("Label first char must be match /[a-z]/");
  }
  for (const char of text.substring(1)) {
    if (
      !"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".includes(
        char
      )
    ) {
      throw new Error("Label char must be match /[a-zA-Z0-9]/");
    }
  }
  return text as firestoreType.Label;
};

const labelTypeConfig: g.GraphQLScalarTypeConfig<
  firestoreType.Label,
  string
> = {
  name: "Label",
  description:
    "Definyでよく使う識別子 最初の1文字はアルファベット、それ以降は数字と大文字アルファベット、小文字のアルファベット。1文字以上63文字以下",
  serialize: (value: firestoreType.Label) => value,
  parseValue: (value: string) => labelFromString(value)
};

export const labelGraphQLType = new g.GraphQLScalarType(labelTypeConfig);
/*  =============================================================
                            Id
    =============================================================
*/
/**
 * Id。各種リソースを識別するために使うID。UUID(v4)やIPv6と同じ128bit, 16bytes
 * 小文字に統一して、大文字は使わない。長さは32文字
 */
export const createRandomId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

const idTypeConfig: g.GraphQLScalarTypeConfig<string, string> = {
  name: "Id",
  description:
    "Id。各種リソースを識別するために使うID。使う文字は0123456789abcdef。長さは32文字",
  serialize: (value: string): string => value,
  parseValue: (value: unknown): string => {
    if (typeof value !== "string") {
      throw new Error("id must be string");
    }
    if (value.length !== 32) {
      throw new Error("Id length must be 32");
    }
    for (const char of value) {
      if (!"0123456789abcdef".includes(char)) {
        throw new Error("Id char must be match /[0-9a-f]/");
      }
    }
    return value;
  }
};

export const idGraphQLType = new g.GraphQLScalarType(idTypeConfig);

/*  =============================================================
                        File Hash
    =============================================================
*/
export const parseFileHash = (value: unknown): firestoreType.FileHash => {
  if (typeof value !== "string") {
    throw new Error("Hash must be string");
  }
  if (value.length !== 64) {
    throw new Error("Hash length must be 64");
  }
  for (const char of value) {
    if (!"0123456789abcdef".includes(char)) {
      throw new Error("Hash char must match /[0-9a-f]/");
    }
  }
  return value as firestoreType.FileHash;
};

const fileHashTypeConfig: g.GraphQLScalarTypeConfig<
  firestoreType.FileHash,
  string
> = {
  name: "Hash",
  description:
    "SHA-256で得られたハッシュ値。hexスタイル。16進数でa-fは小文字、64文字",
  serialize: (value: firestoreType.FileHash): string => value,
  parseValue: parseFileHash
};

export const hashGraphQLType = new g.GraphQLScalarType(fileHashTypeConfig);

export const fileHashDescription =
  "https://us-central1-definy-lang.cloudfunctions.net/file/{hash} のURLからファイルを得ることができる";
/* ==========================================
                SHA-256 Hash
   ==========================================
*/
export const createHash = (data: unknown): string =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");

export const createHashFromBuffer = (
  data: Buffer,
  mimeType: string
): firestoreType.FileHash =>
  crypto
    .createHash("sha256")
    .update(data)
    .update(mimeType, "utf8")
    .digest("hex") as firestoreType.FileHash;

/*  =============================================================
                            DateTime
    =============================================================
*/
const dateTimeTypeConfig: g.GraphQLScalarTypeConfig<Date, number> = {
  name: "DateTime",
  description:
    "日付と時刻。1970年1月1日 00:00:00 UTCから指定した日時までの経過時間をミリ秒で表した数値 2038年問題を回避するために64bitFloatの型を使う",
  serialize: (value: Date): number => value.getTime(),
  parseValue: (value: number): Date => new Date(value),
  parseLiteral: ast => {
    if (ast.kind === "FloatValue" || ast.kind === "IntValue") {
      try {
        return new Date(Number.parseInt(ast.value));
      } catch {
        return null;
      }
    }
    return null;
  }
};

export const dateTimeGraphQLType = new g.GraphQLScalarType(dateTimeTypeConfig);
/*  =============================================================
                        Base64Encoded Png
    =============================================================
*/

export type Base64EncodedPng = string & { __base64EncodedBrand: never };

export const base64EncodedPngFromString = (value: string): Base64EncodedPng =>
  value as Base64EncodedPng;

const base64EncodedPngTypeConfig: g.GraphQLScalarTypeConfig<
  Base64EncodedPng,
  string
> = {
  name: "Base64EncodedPng",
  description: "Base64で表現されたPNG画像",
  serialize: (value: Base64EncodedPng): string => value,
  parseValue: (value: string): Base64EncodedPng => {
    console.log(`parseValue:${value}`);
    return value as Base64EncodedPng;
  },
  parseLiteral: ast => {
    console.log(`parseLiteral:${ast}`);
    if (ast.kind === "StringValue") {
      return ast.value as Base64EncodedPng;
    }
    return null;
  }
};

export const base64EncodedPngGraphQLType = new g.GraphQLScalarType(
  base64EncodedPngTypeConfig
);
/*  =============================================================
                                URL
    =============================================================
*/
const urlTypeScalarTypeConfig: g.GraphQLScalarTypeConfig<URL, string> = {
  name: "URL",
  description: `URL 文字列で指定する 例"https://narumincho.com/definy/spec.html"`,
  serialize: (url: URL): string => url.toString(),
  parseValue: (value: string): URL => new URL(value)
};

export const urlGraphQLType = new g.GraphQLScalarType(urlTypeScalarTypeConfig);
/*  =============================================================
                            AccessToken
    =============================================================
*/
export const createAccessToken = (): firestoreType.AccessToken => {
  return crypto.randomBytes(24).toString("hex") as firestoreType.AccessToken;
};

const accessTokenToTypedArray = (
  accessToken: firestoreType.AccessToken
): Uint8Array => {
  const binary = new Uint8Array(24);
  for (let i = 0; i < 24; i++) {
    binary[i] = Number.parseInt(accessToken.slice(i, i + 2), 16);
  }
  return binary;
};

export const hashAccessToken = (
  accessToken: firestoreType.AccessToken
): firestoreType.AccessTokenHash =>
  crypto
    .createHash("sha256")
    .update(accessTokenToTypedArray(accessToken))
    .digest("hex") as firestoreType.AccessTokenHash;

export const accessTokenDescription =
  "アクセストークン。getLogInUrlで取得したログインURLのページからリダイレクトするときのクエリパラメータについてくる。個人的なデータにアクセスするときに必要。使う文字は0123456789abcdef。長さは48文字";

const accessTokenTypeConfig: g.GraphQLScalarTypeConfig<string, string> = {
  name: "AccessToken",
  description: accessTokenDescription,
  serialize: (value: string): string => value,
  parseValue: (value: unknown): string => {
    if (typeof value !== "string") {
      throw new Error("AccessToken must be string");
    }
    if (value.length !== 48) {
      throw new Error("AccessToken length must be 48");
    }
    for (const char of value) {
      if (!"0123456789abcdef".includes(char)) {
        throw new Error("AccessToken char must be match /[0-9a-f]/");
      }
    }
    return value;
  }
};

export const accessTokenGraphQLType = new g.GraphQLScalarType(
  accessTokenTypeConfig
);
