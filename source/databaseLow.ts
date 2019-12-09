import * as admin from "firebase-admin";
import * as type from "./type";
import * as firestore from "@google-cloud/firestore";
import * as stream from "stream";
import * as firestoreType from "definy-firestore-type";
import * as typedFirestore from "typed-firestore";

const app = admin.initializeApp();

const dataBase = (app.firestore() as unknown) as typedFirestore.TypedFirebaseFirestore<
  firestoreType.Firestore
>;
const storageDefaultBucket = app.storage().bucket();

const userCollection = dataBase.collection("user");
const accessTokenCollection = dataBase.collection("accessToken");
const collectionFromLogInState = (
  logInService: type.SocialLoginService
): FirebaseFirestore.CollectionReference => {
  switch (logInService) {
    case "google":
      return dataBase.collection("googleState");
    case "gitHub":
      return dataBase.collection("gitHubState");
    case "line":
      return dataBase.collection("lineState");
  }
};
const projectCollection = dataBase.collection("project");
const moduleCollection = dataBase.collection("module");
const branchCollection = dataBase.collection("branch");
const commitCollection = dataBase.collection("commit");
const draftCommitCollection = dataBase.collection("draftCommit");
const typeCollection = dataBase.collection("type");
const partCollection = dataBase.collection("part");
const exprCollection = dataBase.collection("expr");
/* ==========================================
                    User
   ==========================================
*/
export type UserData = {
  readonly name: type.UserName;
  readonly imageHash: type.FileHash;
  readonly introduction: string;
  readonly createdAt: firestore.Timestamp;
  readonly branchIds: ReadonlyArray<type.BranchId>;
  readonly lastAccessTokenHash: type.AccessTokenHash;
  readonly logInServiceAndId: type.LogInServiceAndId;
};

/**
 * ユーザーのデータを追加する
 * @param userData ユーザー情報
 * @returns ユーザーのID
 */
export const addUser = async (
  userId: type.UserId,
  userData: UserData
): Promise<type.UserId> => {
  await userCollection.doc(userId).create(userData);
  return userId;
};

/**
 * ユーザーのデータを取得する
 * @param userId
 */
export const getUser = async (userId: type.UserId): Promise<UserData> => {
  const userData = (await userCollection.doc(userId).get()).data();
  if (userData === undefined) {
    throw new Error(`There was no user with userId = ${userId}`);
  }
  return userData as UserData;
};

/**
 * ユーザーのデータを更新する
 */
export const updateUser = async (
  userId: type.UserId,
  data: Partial<UserData>
): Promise<void> => {
  await userCollection.doc(userId).update(data);
};

/**
 * 全てのユーザーのデータを取得する
 */
export const getAllUser = async (): Promise<ReadonlyArray<{
  id: type.UserId;
  data: UserData;
}>> =>
  (await userCollection.get()).docs.map(doc => ({
    id: doc.id as type.UserId,
    data: doc.data() as UserData
  }));

export const searchUsers = async <T extends keyof UserData>(
  filed: T,
  operator: firestore.WhereFilterOp,
  value: UserData[T]
): Promise<Array<{ id: type.UserId; data: UserData }>> =>
  (await userCollection.where(filed, operator, value).get()).docs.map(doc => ({
    id: doc.id as type.UserId,
    data: doc.data() as UserData
  }));

/**
 * Firebase Cloud Storage にファイルを保存する
 * @returns ハッシュ値
 */
export const saveFile = async (
  buffer: Buffer,
  mimeType: string
): Promise<string> => {
  const hash = type.createHashFromBuffer(buffer, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(buffer, { contentType: mimeType });
  return hash;
};

/**
 * Firebase Cloud Storageからファイルを読み込むReadable Streamを取得する
 * @param fileHash ファイルハッシュ
 */
export const getReadableStream = (fileHash: type.FileHash): stream.Readable => {
  return storageDefaultBucket.file(fileHash).createReadStream();
};
/* ==========================================
            Access Token
   ==========================================
*/
type AccessTokenData = {
  readonly userId: type.UserId;
  readonly issuedAt: FirebaseFirestore.Timestamp;
};

export const createAndWriteAccessToken = async (
  accessTokenHash: type.AccessTokenHash,
  data: AccessTokenData
): Promise<void> => {
  await accessTokenCollection.doc(accessTokenHash).create(data);
};

export const verifyAccessToken = async (
  accessTokenHash: type.AccessTokenHash
): Promise<type.UserId> => {
  const data = (
    await accessTokenCollection.doc(accessTokenHash).get()
  ).data() as undefined | AccessTokenData;
  if (data === undefined) {
    throw new Error("invalid access token");
  }
  if (
    data.issuedAt.toMillis() + 1000 * 60 * 60 * 6 < // 6時間
    new Date().getTime()
  ) {
    throw new Error("access token has expired");
  }
  return data.userId;
};
/* ==========================================
                Log In
   ==========================================
*/
/**
 * ソーシャルログイン stateを保存する
 */
export const writeGoogleLogInState = async (
  logInService: type.SocialLoginService,
  state: string
): Promise<void> => {
  await collectionFromLogInState(logInService)
    .doc(state)
    .create({});
};

/**
 * ソーシャルログイン stateが存在することを確認し、存在するなら削除する
 */
export const existsGoogleStateAndDeleteAndGetUserId = async (
  logInService: type.SocialLoginService,
  state: string
): Promise<boolean> => {
  const docRef = collectionFromLogInState(logInService).doc(state);
  const data = (await docRef.get()).data();
  if (data === undefined) {
    return false;
  }
  await docRef.delete();
  return true;
};

/* ==========================================
                Project
   ==========================================
*/

// コレクションはProject。KeyはProjectId
export type ProjectData = {
  readonly masterBranch: type.BranchId;
  readonly branches: ReadonlyArray<type.BranchId>;
  readonly taggedCommitHashes: ReadonlyArray<type.CommitHash>;
};

export const addProject = async (
  data: ProjectData
): Promise<type.ProjectId> => {
  const projectId = type.createRandomId() as type.ProjectId;
  await projectCollection.doc(projectId).create(data);
  return projectId;
};

/**
 * Idで指定したプロジェクトのデータを取得する
 */
export const getProject = async (
  projectId: type.ProjectId
): Promise<ProjectData> => {
  const projectData = (await projectCollection.doc(projectId).get()).data();
  if (projectData === undefined) {
    throw new Error(`There was no project with projectId = ${projectId}`);
  }
  return projectData as ProjectData;
};

/**
 * プロジェクトのデータを変更する
 */
export const updateProject = async (
  projectId: type.ProjectId,
  projectData: Partial<ProjectData>
): Promise<void> => {
  await projectCollection.doc(projectId).update(projectData);
};

/**
 * 全てのプロジェクトのデータを取得する
 */
export const getAllProject = async (): Promise<ReadonlyArray<{
  id: type.ProjectId;
  data: ProjectData;
}>> =>
  (await projectCollection.get()).docs.map(doc => ({
    id: doc.id as type.ProjectId,
    data: doc.data() as ProjectData
  }));

/* ==========================================
                Branch
   ==========================================
*/

// コレクションはbranch。KeyはBranchId
export type BranchData = {
  readonly name: type.Label;
  readonly projectId: type.ProjectId;
  readonly description: string;
  readonly headHash: type.CommitHash;
  readonly ownerId: type.UserId;
};

/**
 * ブランチを作成する
 * @param data
 */
export const addBranch = async (
  id: type.BranchId,
  data: BranchData
): Promise<void> => {
  await branchCollection.doc(id).create(data);
};

/**
 * ブランチを取得する
 */
export const getBranch = async (id: type.BranchId): Promise<BranchData> => {
  const branchData = (await branchCollection.doc(id).get()).data();
  if (branchData === undefined) {
    throw new Error(`There was no branch with branchId = ${id}`);
  }
  return branchData as BranchData;
};

/**
 * ブランチを更新する
 */
export const updateBranch = async (
  id: type.BranchId,
  data: Partial<BranchData>
): Promise<void> => {
  await branchCollection.doc(id).update(data);
};
/* ==========================================
                Commit
   ==========================================
*/

// コレクションはcommit。一度作成したら変更しない。KeyはJSONに変換したときのSHA-256でのハッシュ値
export type CommitData = {
  readonly parentCommitHashes: ReadonlyArray<type.CommitHash>;
  readonly releaseId: null | type.ReleaseId;
  readonly authorId: type.UserId;
  readonly date: firestore.Timestamp;
  readonly commitSummary: string;
  readonly commitDescription: string;
  readonly projectName: string;
  readonly projectIconHash: type.FileHash | null;
  readonly projectImageHash: type.FileHash | null;
  readonly projectSummary: string;
  readonly projectDescription: string;
  readonly children: ReadonlyArray<{
    readonly id: type.ModuleId;
    readonly hash: type.ModuleSnapshotHash;
  }>;
  readonly typeDefs: ReadonlyArray<{
    readonly id: type.TypeId;
    readonly hash: type.TypeDefSnapshotHash;
  }>;
  readonly partDefs: ReadonlyArray<{
    readonly id: type.PartId;
    readonly hash: type.PartDefSnapshotHash;
  }>;
  readonly dependencies: ReadonlyArray<{
    readonly projectId: type.ProjectId;
    readonly releaseId: type.ReleaseId;
  }>;
};

/**
 * コミットを作成する。存在するものをさらに作成したらエラー
 */
export const addCommit = async (data: CommitData): Promise<type.CommitHash> => {
  const hash = type.createHash(data);
  await commitCollection.doc(hash).create(data);
  return hash as type.CommitHash;
};

/**
 * コミットを取得する
 */
export const getCommit = async (hash: type.CommitHash): Promise<CommitData> => {
  const commitData = (await commitCollection.doc(hash).get()).data();
  if (commitData === undefined) {
    throw new Error(`There was no commit with commitHash = ${hash}`);
  }
  return commitData as CommitData;
};
/* ==========================================
                Draft Commit
   ==========================================
*/
export type DraftCommitData = {
  readonly date: firestore.Timestamp;
  readonly description: string;
  readonly isRelease: boolean;
  readonly projectName: string;
  readonly projectIconHash: type.FileHash;
  readonly projectImageHash: type.FileHash;
  readonly projectSummary: string;
  readonly projectDescription: string;
  readonly children: ReadonlyArray<{
    readonly id: type.ModuleId;
    readonly hash: type.ModuleSnapshotHash;
  }>;
  readonly typeDefs: ReadonlyArray<{
    readonly id: type.TypeId;
    readonly hash: type.TypeDefSnapshotHash;
  }>;
  readonly partDefs: ReadonlyArray<{
    readonly id: type.PartId;
    readonly hash: type.PartDefSnapshotHash;
  }>;
  readonly dependencies: ReadonlyArray<{
    readonly projectId: type.ProjectId;
    readonly releaseId: type.ReleaseId;
  }>;
};

/**
 * ドラフトコミットを作成する。存在するものをさらに作成したらエラー
 */
export const addDraftCommit = async (
  data: CommitData
): Promise<type.DraftCommitHash> => {
  const hash = type.createHash(data);
  await draftCommitCollection.doc(hash).create(data);
  return hash as type.DraftCommitHash;
};

/**
 * ドラフトコミットを取得する
 */
export const getDraftCommit = async (
  hash: type.DraftCommitHash
): Promise<DraftCommitData> => {
  const commitData = (await commitCollection.doc(hash).get()).data();
  if (commitData === undefined) {
    throw new Error(`There was no draft commit with draftCommitHash = ${hash}`);
  }
  return commitData as DraftCommitData;
};

/* ==========================================
                Module Snapshot
   ==========================================
*/

// コレクションはmodule。一度作成したら変更しない。KeyはJSONに変換したときのSHA-256でのハッシュ値
export type ModuleSnapshotData = {
  readonly name: type.Label;
  readonly children: ReadonlyArray<{
    readonly id: type.ModuleId;
    readonly hash: type.ModuleSnapshotHash;
  }>;
  readonly typeDefs: ReadonlyArray<{
    readonly id: type.TypeId;
    readonly hash: type.TypeDefSnapshotHash;
  }>;
  readonly partDefs: ReadonlyArray<{
    readonly id: type.PartId;
    readonly hash: type.PartDefSnapshotHash;
  }>;
  readonly description: string;
  readonly exposing: boolean;
};

/**
 * モジュールのスナップショットを作成する。存在するものをさらに追加しようとしたら何もしない。
 */
export const addModuleSnapshot = async (
  data: ModuleSnapshotData
): Promise<type.ModuleSnapshotHash> => {
  const hash = type.createHash(data) as type.ModuleSnapshotHash;
  if ((await moduleCollection.doc(hash).get()).exists) {
    return hash;
  }
  await moduleCollection.doc(hash).create(data);
  return hash;
};

/**
 * モジュールのスナップショットを取得する
 */
export const getModuleSnapshot = async (
  hash: type.ModuleSnapshotHash
): Promise<ModuleSnapshotData> => {
  const moduleData = (await moduleCollection.doc(hash).get()).data();
  if (moduleData === undefined) {
    throw new Error(`There was no module snapshot with hash = ${hash}`);
  }
  return moduleData as ModuleSnapshotData;
};

/* ==========================================
                Type Def Snapshot
   ==========================================
*/

// コレクションはtype。ー度作成したら変更しない。KeyはJSONに変換したときのSHA-256でのハッシュ値
export type TypeDefSnapshot = {
  readonly name: type.Label;
  readonly description: string;
  readonly body: type.TypeBody;
};

/**
 * 型定義のスナップショットを作成する。存在するものをさらに追加しようとしたら何もしない。
 */
export const addTypeDefSnapshot = async (
  data: TypeDefSnapshot
): Promise<type.TypeDefSnapshotHash> => {
  const hash = type.createHash(data) as type.TypeDefSnapshotHash;
  if ((await typeCollection.doc(hash).get()).exists) {
    return hash;
  }
  await typeCollection.doc(hash).create(data);
  return hash;
};

/**
 * 型定義のスナップショットを取得する
 */
export const getTypeDefSnapshot = async (
  hash: type.TypeDefSnapshotHash
): Promise<TypeDefSnapshot> => {
  const typeDefSnapshot = (await typeCollection.doc(hash).get()).data();
  if (typeDefSnapshot === undefined) {
    throw new Error(`There was no typeDef snapshot with hash = ${hash}`);
  }
  return typeDefSnapshot as TypeDefSnapshot;
};
/* ==========================================
                Part Def Snapshot
   ==========================================
*/

// コレクションはpart。ー度作成したら変更しない。KeyはJSONに変換したときのSHA-256でのハッシュ値
export type PartDefSnapshot = {
  readonly name: type.Label;
  readonly description: string;
  readonly type: ReadonlyArray<type.TypeTermOrParenthesis>;
  readonly exprHash: type.ExprSnapshotHash;
};

/**
 * パーツ定義のスナップショットを作成する。存在するものをさらに追加しようとしたら何もしない。
 */
export const addPartDefSnapshot = async (
  data: PartDefSnapshot
): Promise<type.PartDefSnapshotHash> => {
  const hash = type.createHash(data) as type.PartDefSnapshotHash;
  if ((await partCollection.doc(hash).get()).exists) {
    return hash;
  }
  await partCollection.doc(hash).create(data);
  return hash;
};

/**
 * パーツ定義のスナップショットを取得する
 */
export const getPartDefSnapShot = async (
  hash: type.PartDefSnapshotHash
): Promise<PartDefSnapshot> => {
  const partDefSnapshot = (await partCollection.doc(hash).get()).data();
  if (partDefSnapshot === undefined) {
    throw new Error(`There was no partDef snapshot with hash = ${hash}`);
  }
  return partDefSnapshot as PartDefSnapshot;
};
/* ==========================================
                Expr Snapshot
   ==========================================
*/

// コレクションはexpr。ー度作成したら変更しない。KeyはJSONに変換したときのSHA-256でのハッシュ値
export type ExprSnapshot = {
  readonly value: ReadonlyArray<type.TermOrParenthesis>;
};

/**
 * 式のスナップショットを作成する。存在するものをさらに追加しようとしたら何もしない。
 */
export const addExprSnapshot = async (
  data: ExprSnapshot
): Promise<type.ExprSnapshotHash> => {
  const hash = type.createHash(data) as type.ExprSnapshotHash;
  if ((await exprCollection.doc(hash).get()).exists) {
    return hash;
  }
  await exprCollection.doc(hash).create(data);
  return hash;
};

/**
 * 式のスナップショットを取得する
 */
export const getExprSnapshot = async (
  hash: type.ExprSnapshotHash
): Promise<ExprSnapshot> => {
  const exprSnapshot = (await exprCollection.doc(hash).get()).data();
  if (exprSnapshot === undefined) {
    throw new Error(`There was no expr snapshot with hash = ${hash}`);
  }
  return exprSnapshot as ExprSnapshot;
};
/* ==========================================
                Timestamp
   ==========================================
*/
/**
 * 今の時刻のタイムスタンプを得る
 */
export const getNowTimestamp = (): firestore.Timestamp =>
  admin.firestore.Timestamp.now();
