#!/bin/bash
docker run -i --rm \
  -e "GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_CURSOR_TOKEN" \
  ghcr.io/github/github-mcp-server 