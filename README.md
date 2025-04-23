# Docker Compose Cache Action

A GitHub Action that caches Docker images specified in one or more Docker Compose files (`compose.yaml`, `docker-compose.yml`, etc.). Reduces image download times by storing images individually and verifying their freshness via digest checks. Image exclusion is also supported.

## Why Use This Action?

Pulling Docker images, especially large ones like databases or application stacks, can significantly slow down your CI/CD workflows in GitHub Actions. While `actions/cache` is powerful, efficiently caching Docker image layers across jobs, especially for images not built within the workflow (like those pulled from Docker Hub), can be complex and sometimes ineffective due to layer changes.

This action addresses these challenges by:

- **Parsing Compose File(s):** Automatically detects the images your services depend on by reading your `compose.yaml` or `docker-compose.yml` files.
- **Individual Image Caching:** Caches each required Docker image as a separate tarball using `actions/cache`. This improves cache granularity compared to saving multiple images in one large archive.
- **Digest Verification:** Before using a cached image, it checks the image's manifest digest against the current digest in the remote registry using `docker buildx imagetools inspect`. This ensures you always use the correct image version, even if tags like `latest` have been updated, preventing unexpected behavior from stale caches.
- **Efficiency:** Only pulls images that are not found in the cache or whose digests have changed. Only saves images to the cache if they were freshly pulled and their digests match the remote source.
- **Flexibility:** Supports specifying multiple Compose files and allows you to exclude specific images from the caching process.

## Usage

Add this action as a step in your workflow _before_ you run `docker compose up` or commands that require the Docker images.

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
      # - name: Log in to GitHub Container Registry
      #   uses: docker/login-action@v3
      #   with:
      #     registry: ghcr.io
      #     username: ${{ github.actor }}
      #     password: ${{ secrets.GITHUB_TOKEN }}

      - name: Cache Docker Compose Images
        id: cache-docker
        # Use the correct reference after publishing your action
        uses: seijikohara/docker-compose-cache-action@v1 # Replace with your action ref
        with:
          # Optional: Specify one or more compose files
          # compose-files: |
          #   docker-compose.yml
          #   docker-compose.prod.yml

          # Optional: Exclude specific images from caching
          # exclude-images: |
          #   nginx:stable
          #   my-internal-tool:latest

          # Optional: Change the cache key prefix
          # cache-key-prefix: my-project-docker-images

      - name: Display Cache Info (Optional)
        run: |
          echo "Cache hit for all images: ${{ steps.cache-docker.outputs.cache-hit }}"
          echo "Images processed for caching: ${{ steps.cache-docker.outputs.image-list }}"

      - name: Start services with Docker Compose
        # Ensure you use the same files specified in the action if using multiple
        run: docker compose up -d # Or: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

      # --- Your test and build steps go here ---
      # Example:
      # - name: Run Database Migrations
      #   run: docker compose exec -T db migrate
      # - name: Run Application Tests
      #   run: docker compose exec -T app run_tests

      - name: Stop services
        if: always() # Ensure services are stopped even if tests fail
        run: docker compose down
```

## Inputs

| Input              | Description                                                                                                                                              | Required | Default                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `compose-files`    | Path(s) to the Docker Compose file(s). Provide multiple files using multiline string with pipe (`\|`) character. If omitted, searches for default files. | `false`  | Searches `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml` |
| `exclude-images`   | Images to exclude from caching. Provide multiple images using multiline string with pipe (`\|`) character. Exact image name with tag is required.        | `false`  | (empty list)                                                                        |
| `cache-key-prefix` | Prefix for the generated cache key for each image. Change this if you need to invalidate all existing caches for this action.                            | `false`  | `docker-compose-image`                                                              |

## Outputs

| Output       | Description                                                                                                                                | Example Value                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `cache-hit`  | Boolean value (`'true'` or `'false'`) indicating if _all_ required images were successfully restored from cache and their digests matched. | `'true'`                                |
| `image-list` | Space-separated string of unique image names targeted for caching (after applying exclusions).                                             | `'mysql:8.0 redis:alpine myapp:latest'` |

## Authentication for Private Registries

This action currently works best with **public Docker images**. Accessing private registries (like Docker Hub private repositories, GitHub Container Registry (GHCR) private packages, AWS ECR, etc.) requires authentication for both `docker buildx imagetools inspect` (to get the digest) and `docker pull`.

While this action doesn't handle authentication directly, you can usually achieve this by:

1. **Using `docker/login-action`:** Add steps _before_ this action to log in to the required registries. `docker` automatically picks up credentials stored in the standard Docker config file (`~/.docker/config.json`).

   ```yaml
   steps:
     - uses: actions/checkout@v4
     - name: Log in to GitHub Container Registry
       uses: docker/login-action@v3
       with:
         registry: ghcr.io
         username: ${{ github.actor }}
         password: ${{ secrets.GITHUB_TOKEN }}
     # Add other logins (Docker Hub, ECR, etc.) if needed
     - name: Cache Docker Compose Images
       uses: seijikohara/docker-compose-cache-action@v1
       # ...
   ```

Future versions might include more direct ways to pass credentials if needed.
