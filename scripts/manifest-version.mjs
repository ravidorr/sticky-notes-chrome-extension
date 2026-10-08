const MAX_CHROME_VERSION_COMPONENT = 65535;
const VERSION_COMPONENT = /^(0|[1-9]\d*)$/;

function isChromeVersionComponent(component) {
  return VERSION_COMPONENT.test(component)
    && Number(component) <= MAX_CHROME_VERSION_COMPONENT;
}

export function createChromeManifestVersion(packageVersion) {
  const [coreVersion, buildMetadata, ...extraParts] = packageVersion.split('+');
  const coreComponents = coreVersion.split('.');

  if (
    extraParts.length > 0
    || coreComponents.length !== 3
    || !coreComponents.every(isChromeVersionComponent)
  ) {
    throw new Error(
      `Cannot convert package version "${packageVersion}" to a Chrome manifest version.`,
    );
  }

  if (buildMetadata === undefined) {
    return coreVersion;
  }

  if (!isChromeVersionComponent(buildMetadata)) {
    throw new Error(
      `Package version "${packageVersion}" must use one numeric build-metadata component for Chrome builds.`,
    );
  }

  return `${coreVersion}.${buildMetadata}`;
}
