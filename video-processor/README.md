# CenPaya video processor

Separate Node.js + FFmpeg service used by the D1 Worker for transcoding, HLS
generation, thumbnails, playback support, downloads, and retention cleanup.

## Build and run

Use this directory as the Docker build context:

```sh
docker build -t cenpaya-video-processor .
docker run --env-file .env -p 8080:8080 cenpaya-video-processor
```

The image installs FFmpeg, Node.js 22, and the AWS S3 SDK dependencies.

## Required environment

Copy `.env.example` to `.env` on the processor host and supply secrets using
the host's secret manager. Never commit real credentials.

- `VIDEO_PROCESSOR_TOKEN`: shared secret; must exactly match the D1 Worker's
  `VIDEO_PROCESSOR_TOKEN`.
- `B2_REGION`, `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`,
  `B2_BUCKET_NAME`: B2 primary source and HLS storage.
- `TIGRIS_REGION`, `TIGRIS_ENDPOINT`, `TIGRIS_ACCESS_KEY_ID`,
  `TIGRIS_SECRET_ACCESS_KEY`, `TIGRIS_BUCKET_NAME`: Tigris backup storage.
- `PORT`: optional HTTP listen port (defaults to 8080).

Credentials configured as Cloudflare Worker secrets are not inherited by this
separate container. Configure storage credentials as secrets on the processor
host. Never expose them to the browser or commit them to this repository.

## Connect the D1 Worker

Set the Worker's `VIDEO_PROCESSOR_URL` to this service's HTTPS base URL and set
the same `VIDEO_PROCESSOR_TOKEN` on both services. Alternatively, use the
Worker's service binding where the processor is deployed in a compatible
Cloudflare environment.

Keep the processor behind HTTPS and restrict inbound access to the Worker
where the hosting platform supports it. Do not expose it without the shared
token.

## Storage and lifecycle

B2 is primary storage; Tigris receives backup copies. Processor deletion removes
the related source, HLS, and thumbnail objects from both configured stores.
Retention decisions remain in the D1 Worker. This service does not settle
payments or release escrow.

Deploy this container and configure its secrets/URL before enabling the global
video feature. Committing code does not deploy the service or apply D1 migrations.
