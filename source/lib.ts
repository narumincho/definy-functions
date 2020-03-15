import * as common from "definy-common";
import { URL } from "url";
import * as admin from "firebase-admin";
import * as typedFirestore from "typed-admin-firestore";
import * as crypto from "crypto";
import * as functions from "firebase-functions";
import axios, { AxiosResponse } from "axios";
import * as jsonWebToken from "jsonwebtoken";

const app = admin.initializeApp();

type AccessTokenHash = string & { _accessTokenHash: never };

const storageDefaultBucket = app.storage().bucket();
const database = (app.firestore() as unknown) as typedFirestore.Firestore<{
  openConnectState: {
    key: string;
    value: StateData;
    subCollections: {};
  };
  user: {
    key: common.data.UserId;
    value: UserData;
    subCollections: {};
  };
}>;

type StateData = {
  createdAt: admin.firestore.Timestamp;
  urlData: common.data.UrlData;
  provider: common.data.OpenIdConnectProvider;
};

/**
 * 登録してくれたユーザー
 */
type UserData = {
  /** ユーザー名
   * 表示される名前。他のユーザーとかぶっても良い。絵文字も使える
   * 全角英数は半角英数、半角カタカナは全角カタカナ、(株)の合字を分解するなどのNFKCの正規化がされる
   * U+0000-U+0019 と U+007F-U+00A0 の範囲の文字は入らない
   * 前後に空白を含められない
   * 間の空白は2文字以上連続しない
   * 文字数のカウント方法は正規化されたあとのCodePoint単位
   * Twitterと同じ、1文字以上50文字以下
   */
  readonly name: string;
  /**
   * プロフィール画像
   */
  readonly imageHash: common.data.FileHash;
  /**
   * 自己紹介文。改行文字を含めることができる。
   *
   * Twitterと同じ 0～160文字
   */
  readonly introduction: string;
  /** ユーザーが作成された日時 */
  readonly createdAt: admin.firestore.Timestamp;
  /** プロジェクトに対する いいね */
  readonly likedProjectIdList: ReadonlyArray<common.data.ProjectId>;

  readonly developedProjectIdList: ReadonlyArray<common.data.ProjectId>;

  readonly commentedIdeaIdList: ReadonlyArray<common.data.IdeaId>;
  /** アクセストークンのハッシュ値 */
  readonly accessTokenHashList: ReadonlyArray<AccessTokenHashData>;
  /** ユーザーのログイン */
  readonly openIdConnect: OpenIdConnectProviderAndId;
};

/**
 * アクセストークンに含まれるデータ
 */
type AccessTokenHashData = {
  /** アクセストークンのハッシュ値 */
  readonly accessTokenHash: AccessTokenHash;
  /** 発行日時 */
  readonly issuedAt: admin.firestore.Timestamp;
};

/** ソーシャルログインに関する情報 */
type OpenIdConnectProviderAndId = {
  /** プロバイダー (例: LINE, Google, GitHub) */
  readonly provider: common.data.OpenIdConnectProvider;
  /** プロバイダー内でのアカウントID */
  readonly idInProvider: string;
};

type ReleasePartMeta = {
  /** パーツの名前 */
  name: MultiLanguageText;
  /** 説明文 */
  description: MultiLanguageText;
  /** 属しているモジュール */
  moduleId: string;
  /** 語句.検索用 */
  nounList: ReadonlyArray<string>;
  /** 使用している型.検索用 */
  usedTypeList: ReadonlyArray<string>;
  /** 使用しているパーツ.検索用 */
  usedPartList: ReadonlyArray<string>;
  /** 型 */
  type: TypeExpr;
  /** 互換性が維持される間の過去のデータ */
  before: ReadonlyArray<{
    name: MultiLanguageText;
    description: string;
    oldAt: admin.firestore.Timestamp;
  }>;
  /** 作成元 (必ずしも削除されたパーツからではない) */
  parent: ReadonlyArray<string>;
  /** 移行先 (代用可ではない, 最新リリースで削除された(!=[])) */
  destination: ReadonlyArray<string>;
  /** 最終更新日時 */
  updateAt: admin.firestore.Timestamp;
  /** 作成日時 */
  createdAt: admin.firestore.Timestamp;
};

type ReleaseTypeMeta = {
  /** パーツの名前 */
  name: MultiLanguageText;
  /** 説明文 */
  description: MultiLanguageText;
  /** 属しているモジュール */
  moduleId: string;
  /** 語句.検索用 */
  nounList: ReadonlyArray<string>;
  /** 使用している型.検索用 */
  usedTypeList: ReadonlyArray<string>;
  /** 互換性が維持される間の過去のデータ */
  before: ReadonlyArray<{
    name: MultiLanguageText;
    description: string;
    oldAt: admin.firestore.Timestamp;
  }>;
  /** 作成元 (必ずしも削除された型からではない) */
  parent: ReadonlyArray<string>;
  /** 移行先 (代用可ではない, 最新リリースで削除された(!=[])) */
  destination: ReadonlyArray<string>;
  /** 定義本体 */
  type: TypeBody;
  /** 最終更新日時 */
  updateAt: admin.firestore.Timestamp;
  /** 作成日時 */
  createdAt: admin.firestore.Timestamp;
};

type ReleaseModuleMeta = {
  /** モジュール名 (階層を作ることができる) */
  name: ReadonlyArray<MultiLanguageText>;
  /** 属しているプロジェクト */
  projectId: common.data.ProjectId;
  /** 説明文 */
  description: string;
  /** 外部のプロジェクトに公開するかどうか */
  export: boolean;
  /** 作成日時 */
  createdAt: admin.firestore.Timestamp;
};

type MultiLanguageText = {
  en: string;
  ja: string;
};

type TypeBody = {};

type TypeExpr = {};

type Expr = {};

export const requestLogInUrl = async (
  requestLogInUrlRequestData: common.data.RequestLogInUrlRequestData
): Promise<URL> => {
  const state = createRandomId();
  await createStateDocument(
    requestLogInUrlRequestData,
    state,
    admin.firestore.Timestamp.now()
  );
  return logInUrlFromOpenIdConnectProviderAndState(
    requestLogInUrlRequestData.openIdConnectProvider,
    state
  );
};

const createStateDocument = async (
  requestLogInUrlRequestData: common.data.RequestLogInUrlRequestData,
  state: string,
  createdAt: admin.firestore.Timestamp
): Promise<void> => {
  const stateData: StateData = {
    createdAt: createdAt,
    urlData: requestLogInUrlRequestData.urlData,
    provider: requestLogInUrlRequestData.openIdConnectProvider
  };
  await database
    .collection("openConnectState")
    .doc(state)
    .create(stateData);
};

const logInUrlFromOpenIdConnectProviderAndState = (
  openIdConnectProvider: common.data.OpenIdConnectProvider,
  state: string
): URL => {
  switch (openIdConnectProvider) {
    case "Google":
      return createUrl(
        "https://accounts.google.com/o/oauth2/v2/auth",
        new Map([
          ["response_type", "code"],
          ["client_id", getOpenIdConnectClientId("Google")],
          ["redirect_uri", logInRedirectUri("Google")],
          ["scope", "profile openid"],
          ["state", state]
        ])
      );
    case "GitHub":
      return createUrl(
        "https://github.com/login/oauth/authorize",
        new Map([
          ["response_type", "code"],
          ["client_id", getOpenIdConnectClientId("GitHub")],
          ["redirect_uri", logInRedirectUri("GitHub")],
          ["scope", "read:user"],
          ["state", state]
        ])
      );
  }
};

export const getUser = async (
  userId: common.data.UserId
): Promise<common.data.Result<common.data.UserPublic, string>> => {
  const data = (
    await database
      .collection("user")
      .doc(userId)
      .get()
  ).data();
  if (data === undefined) {
    return common.data.resultError(
      "ユーザーが見つからなかった id=" + (userId as string)
    );
  }
  return common.data.resultOk({
    name: data.name,
    imageHash: data.imageHash,
    introduction: data.introduction,
    createdAt: firestoreTimestampToDateTime(data.createdAt),
    likedProjectIdList: data.likedProjectIdList,
    developedProjectIdList: data.developedProjectIdList,
    commentedIdeaIdList: []
  });
};

const firestoreTimestampToDateTime = (
  timestamp: admin.firestore.Timestamp
): common.data.DateTime => {
  const date = timestamp.toDate();
  return {
    year: 10000 + date.getUTCFullYear(),
    month: 1 + date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
};

const createUrl = (
  originAndPath: string,
  query: ReadonlyMap<string, string>
): URL => {
  const url = new URL(originAndPath);
  for (const [key, value] of query) {
    url.searchParams.append(key, value);
  }
  return url;
};

/**
 * Id。各種リソースを識別するために使うID。UUID(v4)やIPv6と同じ128bit, 16bytes
 * 小文字に統一して、大文字は使わない。長さは32文字
 */
const createRandomId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

const logInRedirectUri = (
  openIdConnectProvider: common.data.OpenIdConnectProvider
): string =>
  "https://us-central1-definy-lang.cloudfunctions.net/logInCallback/" +
  (openIdConnectProvider as string);

/**
 * OpenIdConnectで外部ログインからの受け取ったデータを元にログイントークンの入ったURLを返す
 * @param openIdConnectProvider
 * @param code
 * @param state
 */
export const logInCallback = async (
  openIdConnectProvider: common.data.OpenIdConnectProvider,
  code: string,
  state: string
): Promise<common.data.UrlData> => {
  const documentReference = database.collection("openConnectState").doc(state);
  const stateData = (await documentReference.get()).data();
  if (stateData === undefined || stateData.provider !== openIdConnectProvider) {
    throw new Error(
      "Definy do not generate state. openIdConnectProvider=" +
        (openIdConnectProvider as string)
    );
  }
  const providerUserData: ProviderUserData = await getUserDataFromCode(
    openIdConnectProvider,
    code
  );
  const openIdConnectProviderAndIdQuery: OpenIdConnectProviderAndId = {
    idInProvider: providerUserData.id,
    provider: openIdConnectProvider
  };
  const documentList = (
    await database
      .collection("user")
      .where("openIdConnect", "==", openIdConnectProviderAndIdQuery)
      .get()
  ).docs;
  if (documentList.length === 0) {
    const accessToken = await createUser(
      providerUserData,
      openIdConnectProvider
    );
    return {
      ...stateData.urlData,
      accessToken: common.data.maybeJust(accessToken)
    };
  }
  const userQueryDocumentSnapshot = documentList[0];
  const userDocumentReference = userQueryDocumentSnapshot.ref;
  const accessTokenData = issueAccessToken();
  await userDocumentReference.update({
    accessTokenHashList: admin.firestore.FieldValue.arrayUnion(
      accessTokenData.accessTokenHashData
    )
  });
  return {
    ...stateData.urlData,
    accessToken: common.data.maybeJust(accessTokenData.accessToken)
  };
};

type ProviderUserData = {
  id: string;
  name: string;
  imageUrl: URL;
};

const getUserDataFromCode = async (
  openIdConnectProvider: common.data.OpenIdConnectProvider,
  code: string
): Promise<ProviderUserData> => {
  switch (openIdConnectProvider) {
    case "Google":
      return getGoogleUserDataFromCode(code);
    case "GitHub":
      return getGitHubUserDataFromCode(code);
  }
};

const getGoogleUserDataFromCode = async (
  code: string
): Promise<ProviderUserData> => {
  const response = await axios.post(
    createUrl(
      "https://www.googleapis.com/oauth2/v4/token",
      new Map([
        ["grant_type", "authorization_code"],
        ["code", code],
        ["redirect_uri", logInRedirectUri("Google")],
        ["client_id", getOpenIdConnectClientId("Google")],
        ["client_secret", getOpenIdConnectClientSecret("Google")]
      ])
    ).toString(),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      }
    }
  );
  const idToken: string = response.data.id_token;
  const decoded = jsonWebToken.decode(idToken);
  if (typeof decoded === "string" || decoded === null) {
    throw new Error("Google idToken not include object");
  }
  const markedDecoded = decoded as {
    iss: unknown;
    sub: unknown;
    name: unknown;
    picture: unknown;
  };
  if (
    markedDecoded.iss !== "https://accounts.google.com" ||
    typeof markedDecoded.name !== "string" ||
    typeof markedDecoded.sub !== "string" ||
    typeof markedDecoded.picture !== "string"
  ) {
    console.error(
      "Googleから送られてきたIDトークンがおかしい" + markedDecoded.toString()
    );
    throw new Error("Google idToken is invalid");
  }

  return {
    id: markedDecoded.sub,
    name: markedDecoded.name,
    imageUrl: new URL(markedDecoded.picture)
  };
};

const getGitHubUserDataFromCode = async (
  code: string
): Promise<ProviderUserData> => {
  const gitHubAccessToken = (
    await axios.post(
      createUrl(
        "https://github.com/login/oauth/access_token",
        new Map([
          ["grant_type", "authorization_code"],
          ["code", code],
          ["redirect_uri", logInRedirectUri("GitHub")],
          ["client_id", getOpenIdConnectClientId("GitHub")],
          ["client_secret", getOpenIdConnectClientSecret("GitHub")]
        ])
      ).toString(),
      {
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded"
        }
      }
    )
  ).data.access_token;
  if (typeof gitHubAccessToken !== "string") {
    throw new Error("LogInError: GitHub Oauth response is invalid");
  }

  const gitHubData = (
    await axios.post(
      "https://api.github.com/graphql",
      {
        query: `
query {
viewer {
    id
    name
    avatarUrl
}
}
`
      },
      {
        headers: {
          Authorization: "token " + gitHubAccessToken
        }
      }
    )
  ).data.data.viewer;
  if (
    gitHubData === undefined ||
    gitHubData === null ||
    typeof gitHubData === "string"
  ) {
    throw new Error("LogInError: GitHub API response is invalid");
  }
  const id: unknown = gitHubData.id;
  const name: unknown = gitHubData.name;
  const avatarUrl: unknown = gitHubData.avatarUrl;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof avatarUrl !== "string"
  ) {
    throw new Error("LogInError: GitHub API response is invalid");
  }
  return {
    id: id,
    name: name,
    imageUrl: new URL(avatarUrl)
  };
};

const createUser = async (
  providerUserData: ProviderUserData,
  provider: common.data.OpenIdConnectProvider
): Promise<common.data.AccessToken> => {
  const imageHash = await getAndSaveUserImage(providerUserData.imageUrl);
  const createdAt = admin.firestore.Timestamp.now();
  const accessTokenData = issueAccessToken();
  await database
    .collection("user")
    .doc(createRandomId() as common.data.UserId)
    .create({
      name: providerUserData.name,
      commentedIdeaIdList: [],
      createdAt: createdAt,
      developedProjectIdList: [],
      imageHash: imageHash,
      introduction: "",
      accessTokenHashList: [accessTokenData.accessTokenHashData],
      likedProjectIdList: [],
      openIdConnect: {
        idInProvider: providerUserData.id,
        provider: provider
      }
    });
  return accessTokenData.accessToken;
};

const getAndSaveUserImage = async (
  imageUrl: URL
): Promise<common.data.FileHash> => {
  const response: AxiosResponse<Buffer> = await axios.get(imageUrl.toString(), {
    responseType: "arraybuffer"
  });
  const mimeType: string = response.headers["content-type"];
  return await saveFile(response.data, mimeType);
};

/**
 * Firebase Cloud Storage にファイルを保存する
 * @returns ハッシュ値
 */
const saveFile = async (
  buffer: Buffer,
  mimeType: string
): Promise<common.data.FileHash> => {
  const hash = createHashFromBuffer(buffer, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(buffer, { contentType: mimeType });
  return hash;
};

export const createHashFromBuffer = (
  data: Buffer,
  mimeType: string
): common.data.FileHash =>
  crypto
    .createHash("sha256")
    .update(data)
    .update(mimeType, "utf8")
    .digest("hex") as common.data.FileHash;

/**
 * OpenIdConnectのclientSecretはfirebaseの環境変数に設定されている
 */
const getOpenIdConnectClientSecret = (
  openIdConnectProvider: common.data.OpenIdConnectProvider
): string => {
  return functions.config()["openidconnectclientsecret"][
    openIdConnectProvider.toLowerCase()
  ];
};

const getOpenIdConnectClientId = (
  openIdConnectProvider: common.data.OpenIdConnectProvider
): string => {
  switch (openIdConnectProvider) {
    case "Google":
      return "8347840964-l3796imv2d11d0qi8cnb6r48n5jabk9t.apps.googleusercontent.com";
    case "GitHub":
      return "b35031a84487b285978e";
  }
};

/**
 * アクセストークンを生成する
 */
const issueAccessToken = (): {
  accessToken: common.data.AccessToken;
  accessTokenHashData: AccessTokenHashData;
} => {
  const accessToken = crypto
    .randomBytes(32)
    .toString("hex") as common.data.AccessToken;
  const accessTokenHash = crypto
    .createHash("sha256")
    .update(new Uint8Array(common.data.encodeToken(accessToken)))
    .digest("hex") as AccessTokenHash;
  return {
    accessToken: accessToken,
    accessTokenHashData: {
      accessTokenHash: accessTokenHash,
      issuedAt: admin.firestore.Timestamp.now()
    }
  };
};

export const getUserData = async (
  userId: common.data.UserId
): Promise<common.data.Maybe<common.data.UserPublic>> => {
  const userData = (
    await (await database.collection("user").doc(userId)).get()
  ).data();
  if (userData === undefined) {
    return common.data.maybeNothing();
  }
  return common.data.maybeJust({
    name: userData.name,
    imageHash: userData.imageHash,
    introduction: userData.introduction,
    commentedIdeaIdList: userData.commentedIdeaIdList,
    createdAt: firestoreTimestampToDateTime(userData.createdAt),
    developedProjectIdList: userData.developedProjectIdList,
    likedProjectIdList: userData.likedProjectIdList
  });
};
