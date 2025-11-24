import * as core from '@actions/core'
import * as github from '@actions/github'
import * as toolCache from '@actions/tool-cache'
import * as cache from '@actions/cache'
import * as io from '@actions/io'
import * as path from 'path'
import * as fs from 'fs'

const REPO_OWNER = 'PlayEveryWare'
const REPO_NAME = 'pewbuild'
const TOOL_NAME = 'pewbuild'
const BINARY_NAME = 'pewbuild.exe'

interface Release {
  tag_name: string
  assets: Array<{
    name: string
    url: string
  }>
}

// Main entry point
async function run(): Promise<void> {
  try {
    core.saveState('isPost', 'true')

    if (process.platform !== 'win32') {
      core.setFailed(`pewbuild is only supported on Windows. Current platform: ${process.platform}`)
      return
    }

    const version = core.getInput('version') || 'latest'
    const token = core.getInput('token', {required: true })

    core.info(`Setting up pewbuild version: ${version}`)

    // resovle version to a specific tag
    const octokit = github.getOctokit(token)
    const resolvedVersion = await resolveVersion(octokit, version)
    core.info(`Resolved version: ${resolvedVersion}`)

    // check tool cache
    let toolPath: string | null = null
    const cacheKey = `pewbuild-${resolvedVersion}-windows-amd64`
    toolPath = toolCache.find(TOOL_NAME, resolvedVersion)
    if (toolPath) {
      const exePath = path.join(toolPath, BINARY_NAME)
      core.info(`Found cached pewbuild at ${toolPath}`)
      core.setOutput('pewbuild-path', exePath)
      core.setOutput('pewbuild-version', resolvedVersion)
      core.addPath(toolPath)
      return
    }

    // get release information
    core.info(`Fetching release information for ${resolvedVersion}...`)
    const release = await getRelease(octokit, resolvedVersion)

    // find tool binary
    const asset = release.assets.find(a => a.name === BINARY_NAME)
    if (!asset) {
      throw new Error(`${BINARY_NAME} not found in relase ${resolvedVersion}`)
    }

    // download the binary
    core.info(`Downloading pewbuild from ${asset.url}`)
    const response = await octokit.request({
      url: asset.url,
      headers: {
        accept: 'application/octet-stream',
      },
    })

    const downloadPath = path.join(process.env.RUNNER_TEMP || '', `${BINARY_NAME}-${Date.now()}`)
    fs.writeFileSync(downloadPath, Buffer.from(response.data as ArrayBuffer))

    // extract to tool cache
    const toolDir = path.join(process.env.RUNNER_TOOL_CACHE || '', TOOL_NAME, resolvedVersion, 'x64')
    await io.mkdirP(toolDir)

    const finalPath = path.join(toolDir, BINARY_NAME)
    await io.cp(downloadPath, finalPath)
    fs.chmodSync(finalPath, '755')

    toolCache.cacheDir(toolDir, TOOL_NAME, resolvedVersion)

    core.setOutput('pewbuild-path', finalPath)
    core.setOutput('pewbuild-version', resolvedVersion)
    core.addPath(toolDir)

    core.info(`Successfully installed pewbuild ${resolvedVersion} to ${finalPath}`)

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}

// nothing to cleanup yet
async function post() {
}

if (!core.getState('isPost')) {
  run()
} else {
  post()
}

async function resolveVersion(octokit: ReturnType<typeof github.getOctokit>, version: string): Promise<string> {
  if (version === 'latest') {
    const {data} = await octokit.rest.repos.getLatestRelease({
      owner: REPO_OWNER,
      repo: REPO_NAME,
    })

    return data.tag_name
  }

  // handle version ranges (^1.0.0)
  if (version.startsWith('^') || version.startsWith('~')) {
    const {data: releases} = await octokit.rest.repos.listReleases({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      per_page: 100,
    })

    // string ^/~
    const versionPrefix = version.substring(1)
    const [major, minor] = versionPrefix.split('.').map(Number)

    // find the latest release matching teh version range
    let latestMatch: string | null = null
    let latestVersion: [number, number, number] = [0, 0, 0]

    for (const release of releases) {
      const tag = release.tag_name.replace(/^v/, '')
      const parts = tag.split('.').map(Number)

      if (parts.length >= 2) {
        // version: ^1.0.0 ~> match 1.x.x
        // version: ~1.0.0 ~> match 1.0.x
        const matches = version.startsWith('^')
          ? parts[0] === major
          : parts[0] === major && parts[1] === minor

        if (matches && parts.length === 3) {
          const releaseVersion: [number, number, number] = [parts[0], parts[1], parts[2]]
          if (releaseVersion > latestVersion) {
            latestVersion = releaseVersion
            latestMatch = release.tag_name
          }
        }
      }
    }

    if (latestMatch) {
      return latestMatch
    }

    throw new Error(`No release found matching version ragne ${version}`)
  }

  // exact version
  if (!version.startsWith('v')) {
    version = `v${version}`
  }

  return version
}

async function getRelease(octokit: ReturnType<typeof github.getOctokit>, tag: string): Promise<Release> {
  const {data} = await octokit.rest.repos.getReleaseByTag({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    tag: tag,
  })

  return {
    tag_name: data.tag_name,
    assets: data.assets.map(asset => ({
      name: asset.name,
      url: asset.url,
    })),
  }
}
