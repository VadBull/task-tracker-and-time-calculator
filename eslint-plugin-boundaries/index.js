import path from 'node:path'

const normalizePath = (filePath) => filePath.split(path.sep).join('/')

const getLayerFromPath = (filePath, layers) => {
  const normalized = normalizePath(filePath)
  const match = normalized.match(/(?:^|\/)src\/([^/]+)\//)
  if (!match) {
    return null
  }

  const layer = match[1]
  return layers.includes(layer) ? layer : null
}

const getLayerFromSource = ({ source, layers, aliases }) => {
  if (!source) {
    return null
  }

  const aliasMatch = Object.entries(aliases).find(([alias]) =>
    source === alias || source.startsWith(`${alias}/`),
  )

  if (aliasMatch) {
    return aliasMatch[1]
  }

  const normalizedSource = source.startsWith('src/')
    ? source.slice('src/'.length)
    : source

  const directLayer = layers.find(
    (layer) =>
      normalizedSource === layer || normalizedSource.startsWith(`${layer}/`),
  )

  return directLayer ?? null
}

const getLayerFromImport = ({ source, filename, layers, aliases }) => {
  const sourceLayer = getLayerFromSource({ source, layers, aliases })
  if (sourceLayer) {
    return sourceLayer
  }

  if (source?.startsWith('.')) {
    const resolved = path.resolve(path.dirname(filename), source)
    return getLayerFromPath(resolved, layers)
  }

  if (source?.startsWith('/')) {
    return getLayerFromPath(source, layers)
  }

  return null
}

const isAllowedLayerImport = ({ fromLayer, toLayer, layers }) => {
  const fromIndex = layers.indexOf(fromLayer)
  const toIndex = layers.indexOf(toLayer)

  if (fromIndex === -1 || toIndex === -1) {
    return true
  }

  return toIndex >= fromIndex
}

const layerBoundariesRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow imports from higher layers in the app/pages/features/entities/shared hierarchy.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          layers: {
            type: 'array',
            items: { type: 'string' },
          },
          aliases: {
            type: 'object',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      invalidLayerImport:
        'Layer "{{fromLayer}}" cannot import from higher layer "{{toLayer}}".',
    },
  },
  create(context) {
    const filename = context.getFilename()
    if (!filename || filename === '<input>') {
      return {}
    }

    const [{ layers = [], aliases = {} } = {}] = context.options
    const fromLayer = getLayerFromPath(filename, layers)

    if (!fromLayer) {
      return {}
    }

    const checkSource = (node, source) => {
      const toLayer = getLayerFromImport({
        source,
        filename,
        layers,
        aliases,
      })

      if (!toLayer || toLayer === fromLayer) {
        return
      }

      if (!isAllowedLayerImport({ fromLayer, toLayer, layers })) {
        context.report({
          node,
          messageId: 'invalidLayerImport',
          data: { fromLayer, toLayer },
        })
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node, node.source?.value)
      },
      ExportNamedDeclaration(node) {
        checkSource(node, node.source?.value)
      },
      ExportAllDeclaration(node) {
        checkSource(node, node.source?.value)
      },
    }
  },
}

const layerBoundariesPlugin = {
  rules: {
    'layer-imports': layerBoundariesRule,
  },
}

export default layerBoundariesPlugin
