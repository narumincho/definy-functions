import * as common from "definy-common";
import { URL } from "url";
import * as admin from "firebase-admin";
import * as typedFirestore from "typed-admin-firestore";
import * as crypto from "crypto";

const app = admin.initializeApp();

type AccessTokenHash = string & { _accessTokenHash: never };

type FileHash = string & { _fileToken: never };

const dataBase = (app.firestore() as unknown) as typedFirestore.Firestore<{
  user: {
    key: common.data.UserId;
    value: UserData;
    subCollections: {};
  };
  accessToken: {
    key: AccessTokenHash;
    value: AccessTokenData;
    subCollections: {};
  };
}>;

/**
 * アクセストークンに含まれるデータ
 */
type AccessTokenData = {
  /** アクセストークンを発行したユーザー */
  readonly userId: common.data.UserId;
  /** 発行日時 */
  readonly issuedAt: admin.firestore.Timestamp;
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
  readonly imageHash: FileHash;
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
  /** 他のユーザーから見られたくない、個人的なプロジェクトに対する いいね */
  readonly bookmarkedProjectIdList: ReadonlyArray<common.data.ProjectId>;
  /** 最後にログインしたアクセストークンのハッシュ値 */
  readonly lastAccessTokenHash: AccessTokenHash;
  /** ユーザーのログイン */
  readonly openIdConnect: OpenIdConnectProviderAndId;
};

/** ソーシャルログインに関する情報 */
type OpenIdConnectProviderAndId = {
  /** プロバイダー (例: LINE, Google, GitHub) */
  readonly provider: common.data.OpenIdConnectProvider;
  /** プロバイダー内でのアカウントID */
  readonly idInProvider: string;
};

export const requestLogInUrl = async (
  requestLogInUrlRequestData: common.data.RequestLogInUrlRequestData
): Promise<URL> => {
  return new URL("https://www.google.com/");
};

/**
 * Id。各種リソースを識別するために使うID。UUID(v4)やIPv6と同じ128bit, 16bytes
 * 小文字に統一して、大文字は使わない。長さは32文字
 */
export const createRandomId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};
