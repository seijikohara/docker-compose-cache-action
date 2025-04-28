# Docker Compose Cache Action

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/seijikohara/docker-compose-cache-action)](https://github.com/seijikohara/docker-compose-cache-action/releases)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/seijikohara/docker-compose-cache-action/ci.yaml)](https://github.com/seijikohara/docker-compose-cache-action/actions)
[![License](https://img.shields.io/github/license/seijikohara/docker-compose-cache-action)](LICENSE)

A GitHub Action that caches Docker images specified in Docker Compose files to reduce workflow execution time. This action parses your Compose files, intelligently caches images using digests for verification, and only pulls images when necessary.

## Overview

Pulling Docker images can significantly slow down CI/CD workflows in GitHub Actions. While `actions/cache` is effective for many scenarios, caching Docker images from registries presents unique challenges. This action addresses these challenges by:

- **Parsing Docker Compose files** to identify all images used in your services
- **Caching each image as a separate tarball** for better granularity
- **Verifying image freshness via digest checks** to prevent stale cache issues
- **Selective image pulling** based on cache status and digest verification
- **Supporting multiple Compose files** and image exclusion options

## Usage

### Quick Start

```yaml
- name: Cache Docker Compose Images
  uses: seijikohara/docker-compose-cache-action@v1
```

### Complete Example

```yaml
name: CI with Docker Compose Cache

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # Recommended: Login to Docker registries if using private images
      # - name: Log in to Docker Hub
      #   uses: docker/login-action@v3
      #   with:
      #     username: ${{ secrets.DOCKERHUB_USERNAME }}
      #     password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Cache Docker Compose Images
        id: cache-docker
        uses: seijikohara/docker-compose-cache-action@v1
        with:
          # Optional: Specify one or more compose files
          compose-files: |
            docker-compose.yml
            docker-compose.prod.yml
          # Optional: Exclude specific images from caching
          exclude-images: |
            nginx:stable
            my-internal-tool:latest
          # Optional: Change the cache key prefix
          cache-key-prefix: my-project-docker-images

      - name: Display Cache Info
        run: |
          echo "Cache hit for all images: ${{ steps.cache-docker.outputs.cache-hit }}"
          echo "Images processed for caching: ${{ steps.cache-docker.outputs.image-list }}"

      - name: Start services with Docker Compose
        run: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

      # Your test and build steps go here

      - name: Stop services
        if: always()
        run: docker compose down
```

## How It Works

1. **Discovery**: Parses Compose files to identify all Docker images used by services
2. **Cache Check**: For each image, checks if a valid cached version exists using `actions/cache`
3. **Digest Validation**: Uses `docker buildx imagetools inspect` to compare cached image digest with registry
4. **Smart Pulling**: Only pulls images when necessary (not in cache or digest mismatch)
5. **Caching**: Saves pulled images to the cache using `actions/cache` for future workflows

## Configuration

### Inputs

| Input              | Description                                                                                        | Required | Default                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `compose-files`    | Path(s) to Docker Compose file(s). Provide multiple files as multiline string with pipe character. | `false`  | Searches `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml` |
| `exclude-images`   | Images to exclude from caching. Provide multiple images as multiline string with pipe character.   | `false`  | (empty list)                                                                        |
| `cache-key-prefix` | Prefix for the generated cache key for each image. Change to invalidate existing caches.           | `false`  | `docker-compose-image`                                                              |

### Outputs

| Output       | Description                                                                              | Example Value                           |
| ------------ | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| `cache-hit`  | Boolean value (`'true'` or `'false'`) indicating if all images were restored from cache. | `'true'`                                |
| `image-list` | Space-separated string of unique image names targeted for caching.                       | `'mysql:8.0 redis:alpine myapp:latest'` |

## Private Registry Authentication

This action works best with public Docker images. For private registries, add authentication steps before this action:

```yaml
steps:
  - uses: actions/checkout@v4
  - name: Log in to GitHub Container Registry
    uses: docker/login-action@v3
    with:
      registry: ghcr.io
      username: ${{ github.actor }}
      password: ${{ secrets.GITHUB_TOKEN }}
  - name: Cache Docker Compose Images
    uses: seijikohara/docker-compose-cache-action@v1
```

## Limitations

- Works optimally with public Docker images
- Private registries require authentication configured before invoking the action
- Images built in the workflow (not pulled from a registry) won't have registry digests to verify against

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).
