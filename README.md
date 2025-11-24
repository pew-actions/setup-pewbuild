# setup-pewbuild

GitHub Action to set up the pewbuild toolkit for Windows.

## Usage
```
- name: Setup pewbuild
  uses: pew-actions/setup-pewbuild@v1
  with:
    version: 'latest'  # or 'v1.0.0', '^1.0.0', etc.
    token: ${{ secrets.GITHUB_TOKEN }}  # Required for private repo
    cache: 'true'  # Optional, defaults to true## Inputs
```

- `version`: Version of pewbuild to install. Supports:
  - `latest` (default) - Latest release
  - `v1.0.0` - Exact version
  - `^1.0.0` - Latest version matching major version
  - `~1.0.0` - Latest version matching major.minor version
- `token`: GitHub token with access to the private repository (required)

## Outputs

- `pewbuild-path`: Full path to the installed `pewbuild.exe`
- `pewbuild-version`: Version tag of the installed pewbuild

## Requirements

- Windows runner (amd64)
- GitHub token with access to `PlayEveryWare/pewbuild` repository
