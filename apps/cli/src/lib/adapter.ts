import { ConvexAdapter, S3Adapter, LocalAdapter, PostgresAdapter, MySQLAdapter, RedisAdapter } from "@open-vault/adapter";
import type { VaultAdapter } from "@open-vault/adapter";
import type { Config } from "./config.js";
import { loadSession } from "./session.js";

export function createAdapter(config: Config): VaultAdapter {
  const adapterType = config.adapter ?? (config.convexUrl ? "convex" : "local");

  switch (adapterType) {
    case "convex": {
      if (!config.convexUrl) throw new Error("convexUrl required for convex adapter. Run 'ov auth init --url <url>'.");
      const adapter = new ConvexAdapter({ convexUrl: config.convexUrl });
      const session = loadSession();
      if (session) adapter.setToken(session.token);
      return adapter;
    }
    case "s3": {
      if (!config.s3Bucket) throw new Error("s3Bucket required for S3 adapter.");
      return new S3Adapter({
        bucket: config.s3Bucket,
        region: config.s3Region ?? "us-east-1",
        prefix: config.s3Prefix,
        credentials: config.s3AccessKeyId
          ? { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey! }
          : undefined,
      });
    }
    case "r2": {
      if (!config.s3Bucket) throw new Error("s3Bucket required for R2 adapter.");
      if (!config.s3Endpoint) throw new Error("s3Endpoint required for R2 adapter (https://{account-id}.r2.cloudflarestorage.com).");
      if (!config.s3AccessKeyId) throw new Error("s3AccessKeyId required for R2 adapter. Run 'ov auth init --adapter r2' or 'ov onboard'.");
      return new S3Adapter(
        {
          bucket: config.s3Bucket,
          region: "auto",
          endpoint: config.s3Endpoint,
          prefix: config.s3Prefix,
          credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey! },
        },
        "r2"
      );
    }
    case "local":
      return new LocalAdapter({ rootDir: config.localPath });
    case "postgres": {
      if (!config.databaseUrl) throw new Error("databaseUrl required for postgres adapter.");
      return new PostgresAdapter({ databaseUrl: config.databaseUrl });
    }
    case "mysql": {
      if (!config.databaseUrl) throw new Error("databaseUrl required for mysql adapter.");
      return new MySQLAdapter({ databaseUrl: config.databaseUrl });
    }
    case "redis": {
      if (!config.redisUrl) throw new Error("redisUrl required for redis adapter.");
      return new RedisAdapter({ redisUrl: config.redisUrl });
    }
    default:
      throw new Error(`Unknown adapter type: ${adapterType}`);
  }
}
