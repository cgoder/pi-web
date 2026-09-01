# Pi Web

[English](./README.md) | [简体中文](./README.zh-CN.md) | [Русский](./README.ru.md)

[pi コーディングエージェント](https://github.com/earendil-works/pi) のローカルブラウザー UI です。Pi Web は pi と同じローカル設定とセッションファイルを使用し、ブラウザーから会話の検索と再開、エージェントの実行、モデルやリソースの設定、プロジェクトファイルの確認を行えます。

![構造化された Markdown、ツール呼び出し、プロジェクトナビゲーションとともに pi セッションを表示する Pi Web](https://raw.githubusercontent.com/agegr/pi-web/main/docs/screenshot2.png)

## 機能

- **セッションワークスペース**：プロジェクトごとに会話を閲覧、再開、名前変更、エクスポート、削除し、実行状態、コンテキスト使用量、コスト、コンパクション情報を確認できます。
- **2 種類の分岐**：**New session** は以前のメッセージから独立したセッションファイルを作成し、**Edit from here** は現在のセッション内にブランチを作成します。
- **プロジェクトファイルツール**：ファイルの閲覧とアップロード、Git Diff の確認、ソース、Markdown、画像、音声、PDF、DOCX のプレビューに対応し、変更時は自動更新されます。
- **Git worktree**：同じリポジトリのセッションをまとめたまま、サイドバーからチェックアウトを切り替えられます。
- **Web での設定**：Pi Web を離れずに、Provider のログインと API Key、モデル、モデルテスト、プラグインパッケージ、スキルを管理できます。
- **英語、簡体字中国語、繁体字中国語の UI**：初回はブラウザーの言語に従い、トップバーから言語を切り替えられます。

## クイックスタート

Pi Web には Node.js 22.19.0 以降が必要です。`node --version` でバージョンを確認してから、次を実行します：

```bash
npx @agegr/pi-web@latest
```

サーバーの準備が整うと、CLI はブラウザーを自動的に開こうとします。開かない場合は [http://127.0.0.1:30141](http://127.0.0.1:30141) にアクセスしてください。Pi Web はデフォルトで `127.0.0.1` のみをリッスンします。

モデル Provider が未設定の場合は、**Models** パネルを開いてログインするか API Key を追加してください。

`pi-web` コマンドをグローバルにインストールする場合：

```bash
npm install -g @agegr/pi-web@latest
pi-web
```

更新時は、実行中のプロセスを `Ctrl+C` で停止してから同じインストールコマンドを再実行します。アンインストールするには `npm uninstall -g @agegr/pi-web` を実行します。

## 設定

ポートとホスト名では、コマンドラインオプションが対応する環境変数より優先されます。`--no-open` と `PI_WEB_NO_OPEN=1` は、どちらを指定してもブラウザーの自動起動が無効になります。`pi-web --help`（または `-h`）で起動オプションを表示して終了します。未知のオプションはエラーで終了します。

| オプションまたは環境変数 | 用途 | デフォルト |
| --- | --- | --- |
| `--help`、`-h` | 起動オプションを表示して終了 | — |
| `--port <port>`、`-p <port>`、または `PORT` | サーバーポート | `30141` |
| `--hostname <host>`、`-H <host>`、または `PI_WEB_HOSTNAME` | バインドするホスト名 | `127.0.0.1` |
| `--no-open` または `PI_WEB_NO_OPEN=1` | ブラウザーを自動的に開かない | 自動的に開く |
| `PI_WEB_ALLOWED_HOSTS` | 追加で許可するプロキシまたはカスタムホスト名。複数指定はカンマ区切りで完全一致 | 未設定 |
| `PI_WEB_PASSWORD` | HTTP Basic Auth を有効化。ユーザー名は常に `pi` | 認証なし |

例：

```bash
pi-web --help
pi-web -p 8080 -H 0.0.0.0 --no-open
```

### リモートアクセス

ループバック以外のアドレスにバインドすると、高い権限の操作を実行できるエージェントがネットワークに公開されます。信頼できる LAN で使用する場合も、十分に長いランダムなパスワードを設定してください：

```bash
PI_WEB_PASSWORD='十分に長いランダムなパスワード' pi-web --hostname 0.0.0.0
```

Basic Auth は転送中のパスワードを暗号化しません。平文 HTTP で Pi Web をインターネットに公開せず、信頼できるリバースプロキシによる HTTPS または信頼できる VPN を使用してください。リバースプロキシが外部ホスト名を転送する場合は、その名前を完全一致で `PI_WEB_ALLOWED_HOSTS` に追加します。この許可リストは Pi Web のバインド先を変更しません。

### HTTP プロキシ

サーバー側のモデルリクエストと API リクエストは、標準の `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 環境変数を使用します。

macOS または Linux：

```bash
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
NO_PROXY=localhost,127.0.0.1 \
npx @agegr/pi-web@latest
```

Windows PowerShell：

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:NO_PROXY = "localhost,127.0.0.1"
npx @agegr/pi-web@latest
```

## 注意事項

- **エージェントデータ**：Pi Web はデフォルトで `~/.pi/agent` の pi データを読み込みます。セッションファイルは `sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl` にあります。別の pi エージェントディレクトリを使用するには `PI_CODING_AGENT_DIR` を設定してください。
- **ファイルシステムへのアクセス**：Pi Web はエージェントデータディレクトリと、セッションに記録された作業ディレクトリを読み取れる必要があります。既存の pi セッションを共有する場合は、pi と同じファイルシステム環境で Pi Web を実行してください。
- **共有設定**：Models パネルは pi のモデル、設定、認証情報ストレージを使用するため、変更は両方のインターフェースに反映されます。
- **ファイルアクセスの範囲**：ファイルブラウザーは、Pi Web で選択した作業ディレクトリと、既知のプロジェクトまたはセッションルートに限定されます。汎用のファイルシステムブラウザーではありません。
- **Git worktree**：スイッチャーの表示条件、worktree の作成、削除時の動作については [Worktrees in Pi Web](./docs/worktrees.md) を参照してください。

## 開発

```bash
npm install
npm run dev
```

開発サーバーは [http://127.0.0.1:30141](http://127.0.0.1:30141) で動作します。一般的なチェックは次のコマンドで実行します：

```bash
npm test
node_modules/.bin/tsc --noEmit
npm run lint
```

通常の開発中は `next build` または `npm run build` を実行しないでください。`.next/` に書き込まれ、開発サーバーに影響する可能性があります。ビルドはリリース作業時にのみ実行してください。

コントリビューター向けガイド：[Internationalization](./docs/i18n.md) と [Release process](./docs/release.md)。

## デスクトップアプリ（PowerI）

`desktop` ブランチは **PowerI** —— [Tauri 2](https://tauri.app) で構築された軽量なネイティブデスクトップシェルを追加します。シェルは Web アプリ自体を**バンドルしません**：`@poweri/poweri-web`（シェルと同バージョンに固定）をインストールして子プロセスとして起動し、設定されたポートが準備できるのを待ってから、iframe 経由でシステム WebView（macOS は WKWebView、Windows は WebView2）に UI を埋め込みます。バンドル Chromium の代わりにシステム WebView を使うため、インストーラーは約 2 MB です。

初回起動時に PowerI は**セットアップウィザード**を表示し、環境検出を行います：Node.js の存在を確認し、システムにインストール済みの `pi-web`（fnm ルート下のものも含む）を検索し、システム版が見つからない場合のみ `@poweri/poweri-web` の npm インストールにフォールバックします。Node.js が不足しているか古すぎる（< 22.19）場合は、再試行前に修正内容を説明します。

要件：ビルドに Rust ツールチェーン、**実行時に Node.js 22.19+**（アプリ自身が `npx` を起動するため、グローバルインストールは不要）。

```bash
npm install
npm run tauri dev      # 開発モード：next dev + vite シェル、ホットリロード
npm run desktop        # 本番ビルド：shell:build + tauri build
```

インストーラーは `src-tauri/target/release/bundle/`（`.dmg`、`-setup.exe`、`.msi`）に出力されます。GitHub Actions（`.github/workflows/build-poweri-desktop.yml`）は `src-tauri/**`、`shell/**`、またはビルド設定に関するプッシュでマトリックスをビルドし、`poweri-v*` タグで GitHub Release にインストーラーを公開します。

シェル関連のディレクトリ：

```text
shell/                     デスクトップシェル UI（ツールバー + iframe + CLI ログパネル）
shell/launch-machine.ts    起動 FSM：Node 検出 → pi-web 解決 → サーバー準備完了
scripts/dev-shell.mjs      `tauri dev` 用に next dev と vite を同時に実行
src-tauri/                 Tauri 2 アプリ：プロセスマネージャー（pi-web 子プロセスの spawn/kill）、
                           準備プローブ、ログパイプ
vite.config.ts             シェル UI 専用のビルド設定（dist/ に出力）
```

コントリビューター向けの注意事項：

- シェル内では `--no-open` が必須です。これを付けないと pi-web がデスクトップウィンドウ内からブラウザタブを開いてしまいます。
- 開発モード（`tauri dev`）では Rust シェルは `npx` を spawn せず、`scripts/dev-shell.mjs` が起動した `next dev` を待ちます。
- 起動ウィザードはシステムインストール済みの pi-web（`which`/`where` で検出、fnm ルート下も含む）を優先し、見つからない場合のみ `npx` でダウンロードします。Windows では `.cmd` shim を解決し、WSL `\\wsl$` / `\\wsl.localhost` パスを許容します。
- アップグレードボタンは `npx --yes @agegr/pi-web@latest --no-open -p 39999` をプローブとして実行して最新リリースを強制取得し、30141 でサーバーを再起動します。
- `npm run build`（next build）はそのままです——`shell:build` はシェルのみのビルドで、`shell/**` は Next.js の tsconfig から除外されています。

## リポジトリ構成

```text
app/             Next.js UI と API ルート
components/      React UI コンポーネント
hooks/           クライアントの状態と操作に関する hooks
lib/             セッション、エージェント、モデル、ファイル、Git、セキュリティのロジック
public/          静的アセットと PWA ファイル
bin/             npm CLI エントリポイントと起動オプションの解析
docs/            ユーザーおよびコントリビューター向けの個別ガイド
```

アーキテクチャの説明と詳細なファイルマップについては [AGENTS.md](./AGENTS.md) を参照してください。

## ライセンス

[MIT](./LICENSE)
