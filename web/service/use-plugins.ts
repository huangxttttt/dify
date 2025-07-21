import { useCallback, useEffect } from 'react'
import type {
  FormOption,
  ModelProvider,
} from '@/app/components/header/account-setting/model-provider-page/declarations'
import { fetchModelProviderModelList } from '@/service/common'
import { fetchPluginInfoFromMarketPlace } from '@/service/plugins'
import type {
  DebugInfo as DebugInfoTypes,
  Dependency,
  GitHubItemAndMarketPlaceDependency,
  InstallPackageResponse,
  InstalledLatestVersionResponse,
  InstalledPluginListWithTotalResponse,
  PackageDependency,
  Permissions,
  Plugin,
  PluginDeclaration,
  PluginDetail,
  PluginInfoFromMarketPlace,
  PluginTask,
  PluginType,
  PluginsFromMarketplaceByInfoResponse,
  PluginsFromMarketplaceResponse,
  VersionInfo,
  VersionListResponse,
  uploadGitHubResponse,
} from '@/app/components/plugins/types'
import { TaskStatus } from '@/app/components/plugins/types'
import { PluginType as PluginTypeEnum } from '@/app/components/plugins/types'
import type {
  PluginsSearchParams,
} from '@/app/components/plugins/marketplace/types'
import { get, getMarketplace, post, postMarketplace } from './base'
import type { MutateOptions, QueryOptions } from '@tanstack/react-query'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useInvalidateAllBuiltInTools } from './use-tools'
import usePermission from '@/app/components/plugins/plugin-page/use-permission'
import { uninstallPlugin } from '@/service/plugins'
import useRefreshPluginList from '@/app/components/plugins/install-plugin/hooks/use-refresh-plugin-list'
import { cloneDeep } from 'lodash-es'

const NAME_SPACE = 'plugins'

const useInstalledPluginListKey = [NAME_SPACE, 'installedPluginList']
export const useCheckInstalled = ({
  pluginIds,
  enabled,
}: {
  pluginIds: string[],
  enabled: boolean
}) => {
  return useQuery<{ plugins: PluginDetail[] }>({
    queryKey: [NAME_SPACE, 'checkInstalled', pluginIds],
    queryFn: () => post<{ plugins: PluginDetail[] }>('/workspaces/current/plugin/list/installations/ids', {
      body: {
        plugin_ids: pluginIds,
      },
    }),
    enabled,
    staleTime: 0, // always fresh
  })
}

export const useInstalledPluginList = (disable?: boolean, pageSize = 100) => {
  const fetchPlugins = async ({ pageParam = 1 }) => {
    const response = await get<InstalledPluginListWithTotalResponse>(
      `/workspaces/current/plugin/list?page=${pageParam}&page_size=${pageSize}`,
    )
    return response
  }

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isSuccess,
  } = useInfiniteQuery({
    enabled: !disable,
    queryKey: useInstalledPluginListKey,
    queryFn: fetchPlugins,
    getNextPageParam: (lastPage, pages) => {
      const totalItems = lastPage.total
      const currentPage = pages.length
      const itemsLoaded = currentPage * pageSize

      if (itemsLoaded >= totalItems)
        return

      return currentPage + 1
    },
    initialPageParam: 1,
  })

  const plugins = data?.pages.flatMap(page => page.plugins) ?? []
  const total = data?.pages[0].total ?? 0

  return {
    data: disable ? undefined : {
      plugins,
      total,
    },
    isLastPage: !hasNextPage,
    loadNextPage: () => {
      fetchNextPage()
    },
    isLoading,
    isFetching: isFetchingNextPage,
    error,
    isSuccess,
  }
}

export const useInstalledLatestVersion = (pluginIds: string[]) => {
  return useQuery<InstalledLatestVersionResponse>({
    queryKey: [NAME_SPACE, 'installedLatestVersion', pluginIds],
    queryFn: () => post<InstalledLatestVersionResponse>('/workspaces/current/plugin/list/latest-versions', {
      body: {
        plugin_ids: pluginIds,
      },
    }),
    enabled: !!pluginIds.length,
    initialData: pluginIds.length ? undefined : { versions: {} },
  })
}

export const useInvalidateInstalledPluginList = () => {
  const queryClient = useQueryClient()
  const invalidateAllBuiltInTools = useInvalidateAllBuiltInTools()
  return () => {
    queryClient.invalidateQueries(
      {
        queryKey: useInstalledPluginListKey,
      })
    invalidateAllBuiltInTools()
  }
}

export const useInstallPackageFromMarketPlace = (options?: MutateOptions<InstallPackageResponse, Error, string>) => {
  return useMutation({
    ...options,
    mutationFn: (uniqueIdentifier: string) => {
      return post<InstallPackageResponse>('/workspaces/current/plugin/install/marketplace', { body: { plugin_unique_identifiers: [uniqueIdentifier] } })
    },
  })
}

export const useUpdatePackageFromMarketPlace = (options?: MutateOptions<InstallPackageResponse, Error, object>) => {
  return useMutation({
    ...options,
    mutationFn: (body: object) => {
      return post<InstallPackageResponse>('/workspaces/current/plugin/upgrade/marketplace', {
        body,
      })
    },
  })
}

export const usePluginDeclarationFromMarketPlace = (pluginUniqueIdentifier: string) => {
  return useQuery({
    queryKey: [NAME_SPACE, 'pluginDeclaration', pluginUniqueIdentifier],
    queryFn: () => get<{ manifest: PluginDeclaration }>('/workspaces/current/plugin/marketplace/pkg', { params: { plugin_unique_identifier: pluginUniqueIdentifier } }),
    enabled: !!pluginUniqueIdentifier,
  })
}

export const useVersionListOfPlugin = (pluginID: string) => {
  return useQuery<{ data: VersionListResponse }>({
    enabled: !!pluginID,
    queryKey: [NAME_SPACE, 'versions', pluginID],
    queryFn: () => getMarketplace<{ data: VersionListResponse }>(`/plugins/${pluginID}/versions`, { params: { page: 1, page_size: 100 } }),
  })
}
export const useInvalidateVersionListOfPlugin = () => {
  const queryClient = useQueryClient()
  return (pluginID: string) => {
    queryClient.invalidateQueries({ queryKey: [NAME_SPACE, 'versions', pluginID] })
  }
}

export const useInstallPackageFromLocal = () => {
  return useMutation({
    mutationFn: (uniqueIdentifier: string) => {
      return post<InstallPackageResponse>('/workspaces/current/plugin/install/pkg', {
        body: { plugin_unique_identifiers: [uniqueIdentifier] },
      })
    },
  })
}

export const useInstallPackageFromGitHub = () => {
  return useMutation({
    mutationFn: ({ repoUrl, selectedVersion, selectedPackage, uniqueIdentifier }: {
      repoUrl: string
      selectedVersion: string
      selectedPackage: string
      uniqueIdentifier: string
    }) => {
      return post<InstallPackageResponse>('/workspaces/current/plugin/install/github', {
        body: {
          repo: repoUrl,
          version: selectedVersion,
          package: selectedPackage,
          plugin_unique_identifier: uniqueIdentifier,
        },
      })
    },
  })
}

export const useUploadGitHub = (payload: {
  repo: string
  version: string
  package: string
}) => {
  return useQuery({
    queryKey: [NAME_SPACE, 'uploadGitHub', payload],
    queryFn: () => post<uploadGitHubResponse>('/workspaces/current/plugin/upload/github', {
      body: payload,
    }),
    retry: 0,
  })
}

export const useInstallOrUpdate = ({
  onSuccess,
}: {
  onSuccess?: (res: { success: boolean }[]) => void
}) => {
  const { mutateAsync: updatePackageFromMarketPlace } = useUpdatePackageFromMarketPlace()

  return useMutation({
    mutationFn: (data: {
      payload: Dependency[],
      plugin: Plugin[],
      installedInfo: Record<string, VersionInfo>
    }) => {
      const { payload, plugin, installedInfo } = data

      return Promise.all(payload.map(async (item, i) => {
        try {
          const orgAndName = `${plugin[i]?.org || plugin[i]?.author}/${plugin[i]?.name}`
          const installedPayload = installedInfo[orgAndName]
          const isInstalled = !!installedPayload
          let uniqueIdentifier = ''

          if (item.type === 'github') {
            const data = item as GitHubItemAndMarketPlaceDependency
            // From local bundle don't have data.value.github_plugin_unique_identifier
            uniqueIdentifier = data.value.github_plugin_unique_identifier!
            if (!uniqueIdentifier) {
              const { unique_identifier } = await post<uploadGitHubResponse>('/workspaces/current/plugin/upload/github', {
                body: {
                  repo: data.value.repo!,
                  version: data.value.release! || data.value.version!,
                  package: data.value.packages! || data.value.package!,
                },
              })
              uniqueIdentifier = data.value.github_plugin_unique_identifier! || unique_identifier
              // has the same version, but not installed
              if (uniqueIdentifier === installedPayload?.uniqueIdentifier) {
                return {
                  success: true,
                }
              }
            }
            if (!isInstalled) {
              await post<InstallPackageResponse>('/workspaces/current/plugin/install/github', {
                body: {
                  repo: data.value.repo!,
                  version: data.value.release! || data.value.version!,
                  package: data.value.packages! || data.value.package!,
                  plugin_unique_identifier: uniqueIdentifier,
                },
              })
            }
          }
          if (item.type === 'marketplace') {
            const data = item as GitHubItemAndMarketPlaceDependency
            uniqueIdentifier = data.value.marketplace_plugin_unique_identifier! || plugin[i]?.plugin_id
            if (uniqueIdentifier === installedPayload?.uniqueIdentifier) {
              return {
                success: true,
              }
            }
            if (!isInstalled) {
              await post<InstallPackageResponse>('/workspaces/current/plugin/install/marketplace', {
                body: {
                  plugin_unique_identifiers: [uniqueIdentifier],
                },
              })
            }
          }
          if (item.type === 'package') {
            const data = item as PackageDependency
            uniqueIdentifier = data.value.unique_identifier
            if (uniqueIdentifier === installedPayload?.uniqueIdentifier) {
              return {
                success: true,
              }
            }
            if (!isInstalled) {
              await post<InstallPackageResponse>('/workspaces/current/plugin/install/pkg', {
                body: {
                  plugin_unique_identifiers: [uniqueIdentifier],
                },
              })
            }
          }
          if (isInstalled) {
            if (item.type === 'package') {
              await uninstallPlugin(installedPayload.installedId)
              await post<InstallPackageResponse>('/workspaces/current/plugin/install/pkg', {
                body: {
                  plugin_unique_identifiers: [uniqueIdentifier],
                },
              })
            }
            else {
              await updatePackageFromMarketPlace({
                original_plugin_unique_identifier: installedPayload?.uniqueIdentifier,
                new_plugin_unique_identifier: uniqueIdentifier,
              })
            }
          }
          return ({ success: true })
        }
        // eslint-disable-next-line unused-imports/no-unused-vars
        catch (e) {
          return Promise.resolve({ success: false })
        }
      }))
    },
    onSuccess,
  })
}

export const useDebugKey = () => {
  return useQuery({
    queryKey: [NAME_SPACE, 'debugKey'],
    queryFn: () => get<DebugInfoTypes>('/workspaces/current/plugin/debugging-key'),
  })
}

const usePermissionsKey = [NAME_SPACE, 'permissions']
export const usePermissions = () => {
  return useQuery({
    queryKey: usePermissionsKey,
    queryFn: () => get<Permissions>('/workspaces/current/plugin/permission/fetch'),
  })
}

export const useInvalidatePermissions = () => {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries(
      {
        queryKey: usePermissionsKey,
      })
  }
}

export const useMutationPermissions = ({
  onSuccess,
}: {
  onSuccess?: () => void
}) => {
  return useMutation({
    mutationFn: (payload: Permissions) => {
      return post('/workspaces/current/plugin/permission/change', { body: payload })
    },
    onSuccess,
  })
}

export const useMutationPluginsFromMarketplace2 = () => {
    return useMutation({
        mutationFn: async (pluginsSearchParams: PluginsSearchParams) => {
            const page = pluginsSearchParams.page || 1
            const pageSize = pluginsSearchParams.pageSize || 40
            const excludeList = pluginsSearchParams.exclude || []
            const mockPluginList = [
                {
                    agent_strategy: {},
                    badges: [],
                    brief: {
                        en_US: 'Ollama',
                    },
                    category: 'model',
                    created_at: '2024-12-04T09:46:32Z',
                    endpoint: {},
                    icon: 'langgenius/packages/ollama/_assets/icon_s_en.svg',
                    index_id: 'langgenius___ollama',
                    install_count: 146874,
                    introduction: '## Overview\n\nOllama is a cross-platform inference framework client (MacOS, Windows, Linux) designed for seamless deployment of large language models (LLMs) such as Llama 2, Mistral, Llava, and more. With its one-click setup, Ollama enables local execution of LLMs, providing enhanced data privacy and security by keeping your data on your own machine.\n\nDify supports integrating LLM and Text Embedding capabilities of large language models deployed with Ollama.\n\n## Configure\n\n#### 1. Download Ollama\nVisit [Ollama download page](https://ollama.com/download) to download the Ollama client for your system.\n\n#### 2. Run Ollama and Chat with Llava\n\n````\nollama run llama3.2\n````\n\nAfter successful launch, Ollama starts an API service on local port 11434, which can be accessed at `http://localhost:11434`.\n\nFor other models, visit [Ollama Models](https://ollama.com/library) for more details.\n\n#### 3. Install Ollama Plugin\nGo to the Dify marketplace and search the Ollama to download it.\n\n![](./_assets/ollama-01.png)\n\n#### 4. Integrate Ollama in Dify\n\nIn `Settings \u003E Model Providers \u003E Ollama`, fill in:\n\n![](./_assets/ollama-02.png)\n\n- Model Name：`llama3.2`\n- Base URL: `http://\u003Cyour-ollama-endpoint-domain\u003E:11434`\n- Enter the base URL where the Ollama service is accessible.\n- If Dify is deployed using Docker, consider using the local network IP address, e.g., `http://192.168.1.100:11434` or `http://host.docker.internal:11434` to access the service.\n- For local source code deployment, use `http://localhost:11434`.\n- Model Type: `Chat`\n- Model Context Length: `4096`\n- The maximum context length of the model. If unsure, use the default value of 4096.\n- Maximum Token Limit: `4096`\n- The maximum number of tokens returned by the model. If there are no specific requirements for the model, this can be consistent with the model context length.\n- Support for Vision: `Yes`\n- Check this option if the model supports image understanding (multimodal), like `llava`.\n\nClick "Save" to use the model in the application after verifying that there are no errors.\n\nThe integration method for Embedding models is similar to LLM, just change the model type to Text Embedding.\n\nFor more detail, please check [Dify\'s official document](https://docs.dify.ai/development/models-integration/ollama).\n',
                    label: {
                        en_US: 'Ollama',
                    },
                    latest_package_identifier: 'langgenius/ollama:0.0.6@7d66a960a68cafdcdf5589fdf5d01a995533f956853c69c54eddcf797006fa37',
                    latest_version: '0.0.6',
                    model: {
                        background: '#F9FAFB',
                        configurate_methods: [
                            'customizable-model',
                        ],
                        description: {
                            en_US: 'Ollama',
                        },
                        help: {
                            title: {
                                en_US: 'How to integrate with Ollama',
                                zh_Hans: '如何集成 Ollama',
                            },
                            url: {
                                en_US: 'https://docs.dify.ai/tutorials/model-configuration/ollama',
                            },
                        },
                        icon_large: {
                            en_US: 'icon_l_en.svg',
                        },
                        icon_small: {
                            en_US: 'icon_s_en.svg',
                        },
                        label: {
                            en_US: 'Ollama',
                        },
                        model_credential_schema: {
                            credential_form_schemas: [
                                {
                                    default: null,
                                    label: {
                                        en_US: 'Base URL',
                                        zh_Hans: '基础 URL',
                                    },
                                    max_length: 0,
                                    options: [],
                                    placeholder: {
                                        en_US: 'Base url of Ollama server, e.g. http://192.168.1.100:11434',
                                        zh_Hans: 'Ollama server 的基础 URL，例如 http://192.168.1.100:11434',
                                    },
                                    required: true,
                                    show_on: [],
                                    type: 'text-input',
                                    variable: 'base_url',
                                },
                                {
                                    default: 'chat',
                                    label: {
                                        en_US: 'Completion mode',
                                        zh_Hans: '模型类型',
                                    },
                                    max_length: 0,
                                    options: [
                                        {
                                            label: {
                                                en_US: 'Completion',
                                                zh_Hans: '补全',
                                            },
                                            show_on: [],
                                            value: 'completion',
                                        },
                                        {
                                            label: {
                                                en_US: 'Chat',
                                                zh_Hans: '对话',
                                            },
                                            show_on: [],
                                            value: 'chat',
                                        },
                                    ],
                                    placeholder: {
                                        en_US: 'Select completion mode',
                                        zh_Hans: '选择对话类型',
                                    },
                                    required: true,
                                    show_on: [
                                        {
                                            value: 'llm',
                                            variable: '__model_type',
                                        },
                                    ],
                                    type: 'select',
                                    variable: 'mode',
                                },
                                {
                                    default: '4096',
                                    label: {
                                        en_US: 'Model context size',
                                        zh_Hans: '模型上下文长度',
                                    },
                                    max_length: 0,
                                    options: [],
                                    placeholder: {
                                        en_US: 'Enter your Model context size',
                                        zh_Hans: '在此输入您的模型上下文长度',
                                    },
                                    required: true,
                                    show_on: [],
                                    type: 'text-input',
                                    variable: 'context_size',
                                },
                                {
                                    default: '4096',
                                    label: {
                                        en_US: 'Upper bound for max tokens',
                                        zh_Hans: '最大 token 上限',
                                    },
                                    max_length: 0,
                                    options: [],
                                    placeholder: null,
                                    required: true,
                                    show_on: [
                                        {
                                            value: 'llm',
                                            variable: '__model_type',
                                        },
                                    ],
                                    type: 'text-input',
                                    variable: 'max_tokens',
                                },
                                {
                                    default: 'false',
                                    label: {
                                        en_US: 'Vision support',
                                        zh_Hans: '是否支持 Vision',
                                    },
                                    max_length: 0,
                                    options: [
                                        {
                                            label: {
                                                en_US: 'Yes',
                                                zh_Hans: '是',
                                            },
                                            show_on: [],
                                            value: 'true',
                                        },
                                        {
                                            label: {
                                                en_US: 'No',
                                                zh_Hans: '否',
                                            },
                                            show_on: [],
                                            value: 'false',
                                        },
                                    ],
                                    placeholder: null,
                                    required: false,
                                    show_on: [
                                        {
                                            value: 'llm',
                                            variable: '__model_type',
                                        },
                                    ],
                                    type: 'radio',
                                    variable: 'vision_support',
                                },
                                {
                                    default: 'false',
                                    label: {
                                        en_US: 'Function call support',
                                        zh_Hans: '是否支持函数调用',
                                    },
                                    max_length: 0,
                                    options: [
                                        {
                                            label: {
                                                en_US: 'Yes',
                                                zh_Hans: '是',
                                            },
                                            show_on: [],
                                            value: 'true',
                                        },
                                        {
                                            label: {
                                                en_US: 'No',
                                                zh_Hans: '否',
                                            },
                                            show_on: [],
                                            value: 'false',
                                        },
                                    ],
                                    placeholder: null,
                                    required: false,
                                    show_on: [
                                        {
                                            value: 'llm',
                                            variable: '__model_type',
                                        },
                                    ],
                                    type: 'radio',
                                    variable: 'function_call_support',
                                },
                            ],
                            model: {
                                label: {
                                    en_US: 'Model Name',
                                    zh_Hans: '模型名称',
                                },
                                placeholder: {
                                    en_US: 'Enter your model name',
                                    zh_Hans: '输入模型名称',
                                },
                            },
                        },
                        models: [],
                        provider: 'ollama',
                        provider_credential_schema: null,
                        supported_model_types: [
                            'llm',
                            'text-embedding',
                        ],
                    },
                    name: 'ollama',
                    org: 'langgenius',
                    plugin_id: 'langgenius/ollama',
                    plugins: {
                        agent_strategies: null,
                        endpoints: null,
                        models: [
                            'provider/ollama.yaml',
                        ],
                        tools: null,
                    },
                    privacy_options: '',
                    privacy_policy: '',
                    repository: '',
                    resource: {
                        memory: 268435456,
                        permission: {
                            model: {
                                enabled: true,
                                llm: true,
                                moderation: false,
                                rerank: true,
                                speech2text: false,
                                text_embedding: true,
                                tts: false,
                            },
                            tool: {
                                enabled: true,
                            },
                        },
                    },
                    status: 'active',
                    tags: [],
                    tool: {},
                    type: 'plugin',
                    updated_at: '2025-04-29T02:40:26Z',
                    version_updated_at: '2025-04-29T02:40:26Z',
                },
            ]
            const filteredPlugins = [...mockPluginList.filter(plugin => !excludeList.includes(plugin.plugin_id))]
            const pagedPlugins = filteredPlugins.slice((page - 1) * pageSize, page * pageSize)
            console.log(pagedPlugins)
            return Promise.resolve({
                data: {
                    plugins: pagedPlugins,
                    total: mockPluginList.length,
                },
            })
        },
    })
}

export const useMutationPluginsFromMarketplace = () => {
  return useMutation({
    mutationFn: (pluginsSearchParams: PluginsSearchParams) => {
      const {
        query,
        sortBy,
        sortOrder,
        category,
        tags,
        exclude,
        type,
        page = 1,
        pageSize = 40,
      } = pluginsSearchParams
      const pluginOrBundle = type === 'bundle' ? 'bundles' : 'plugins'
      return postMarketplace<{ data: PluginsFromMarketplaceResponse }>(`/${pluginOrBundle}/search/advanced`, {
        body: {
          page,
          page_size: pageSize,
          query,
          sort_by: sortBy,
          sort_order: sortOrder,
          category: category !== 'all' ? category : '',
          tags,
          exclude,
          type,
        },
      })
    },
  })
}

export const useFetchPluginsInMarketPlaceByIds = (unique_identifiers: string[], options?: QueryOptions<{ data: PluginsFromMarketplaceResponse }>) => {
  return useQuery({
    ...options,
    queryKey: [NAME_SPACE, 'fetchPluginsInMarketPlaceByIds', unique_identifiers],
    queryFn: () => postMarketplace<{ data: PluginsFromMarketplaceResponse }>('/plugins/identifier/batch', {
      body: {
        unique_identifiers,
      },
    }),
    enabled: unique_identifiers?.filter(i => !!i).length > 0,
    retry: 0,
  })
}

export const useFetchPluginsInMarketPlaceByInfo = (infos: Record<string, any>[]) => {
  return useQuery({
    queryKey: [NAME_SPACE, 'fetchPluginsInMarketPlaceByInfo', infos],
    queryFn: () => postMarketplace<{ data: PluginsFromMarketplaceByInfoResponse }>('/plugins/versions/batch', {
      body: {
        plugin_tuples: infos.map(info => ({
          org: info.organization,
          name: info.plugin,
          version: info.version,
        })),
      },
    }),
    enabled: infos?.filter(i => !!i).length > 0,
    retry: 0,
  })
}

const usePluginTaskListKey = [NAME_SPACE, 'pluginTaskList']
export const usePluginTaskList = (category?: PluginType) => {
  const {
    canManagement,
  } = usePermission()
  const { refreshPluginList } = useRefreshPluginList()
  const {
    data,
    isFetched,
    isRefetching,
    refetch,
    ...rest
  } = useQuery({
    enabled: canManagement,
    queryKey: usePluginTaskListKey,
    queryFn: () => get<{ tasks: PluginTask[] }>('/workspaces/current/plugin/tasks?page=1&page_size=100'),
    refetchInterval: (lastQuery) => {
      const lastData = lastQuery.state.data
      const taskDone = lastData?.tasks.every(task => task.status === TaskStatus.success || task.status === TaskStatus.failed)
      return taskDone ? false : 5000
    },
  })

  useEffect(() => {
    // After first fetch, refresh plugin list each time all tasks are done
    if (!isRefetching) {
      const lastData = cloneDeep(data)
      const taskDone = lastData?.tasks.every(task => task.status === TaskStatus.success || task.status === TaskStatus.failed)
      const taskAllFailed = lastData?.tasks.every(task => task.status === TaskStatus.failed)
      if (taskDone) {
        if (lastData?.tasks.length && !taskAllFailed)
          refreshPluginList(category ? { category } as any : undefined, !category)
      }
    }
  }, [isRefetching])

  const handleRefetch = useCallback(() => {
    refetch()
  }, [refetch])

  return {
    data,
    pluginTasks: data?.tasks || [],
    isFetched,
    handleRefetch,
    ...rest,
  }
}

export const useMutationClearTaskPlugin = () => {
  return useMutation({
    mutationFn: ({ taskId, pluginId }: { taskId: string; pluginId: string }) => {
      return post<{ success: boolean }>(`/workspaces/current/plugin/tasks/${taskId}/delete/${pluginId}`)
    },
  })
}

export const useMutationClearAllTaskPlugin = () => {
  return useMutation({
    mutationFn: () => {
      return post<{ success: boolean }>('/workspaces/current/plugin/tasks/delete_all')
    },
  })
}

export const usePluginManifestInfo = (pluginUID: string) => {
  return useQuery({
    enabled: !!pluginUID,
    queryKey: [[NAME_SPACE, 'manifest', pluginUID]],
    queryFn: () => getMarketplace<{ data: { plugin: PluginInfoFromMarketPlace, version: { version: string } } }>(`/plugins/${pluginUID}`),
    retry: 0,
  })
}

export const useDownloadPlugin = (info: { organization: string; pluginName: string; version: string }, needDownload: boolean) => {
  return useQuery({
    queryKey: [NAME_SPACE, 'downloadPlugin', info],
    queryFn: () => getMarketplace<Blob>(`/plugins/${info.organization}/${info.pluginName}/${info.version}/download`),
    enabled: needDownload,
    retry: 0,
  })
}

export const useMutationCheckDependencies = () => {
  return useMutation({
    mutationFn: (appId: string) => {
      return get<{ leaked_dependencies: Dependency[] }>(`/apps/imports/${appId}/check-dependencies`)
    },
  })
}

export const useModelInList = (currentProvider?: ModelProvider, modelId?: string) => {
  return useQuery({
    queryKey: ['modelInList', currentProvider?.provider, modelId],
    queryFn: async () => {
      if (!modelId || !currentProvider) return false
      try {
        const modelsData = await fetchModelProviderModelList(`/workspaces/current/model-providers/${currentProvider?.provider}/models`)
        return !!modelId && !!modelsData.data.find(item => item.model === modelId)
      }
      catch {
        return false
      }
    },
    enabled: !!modelId && !!currentProvider,
  })
}

export const usePluginInfo = (providerName?: string) => {
  return useQuery({
    queryKey: ['pluginInfo', providerName],
    queryFn: async () => {
      if (!providerName) return null
      const parts = providerName.split('/')
      const org = parts[0]
      const name = parts[1]
      try {
        const response = await fetchPluginInfoFromMarketPlace({ org, name })
        return response.data.plugin.category === PluginTypeEnum.model ? response.data.plugin : null
      }
      catch {
        return null
      }
    },
    enabled: !!providerName,
  })
}

export const useFetchDynamicOptions = (plugin_id: string, provider: string, action: string, parameter: string, provider_type: 'tool') => {
  return useMutation({
    mutationFn: () => get<{ options: FormOption[] }>('/workspaces/current/plugin/parameters/dynamic-options', {
      params: {
        plugin_id,
        provider,
        action,
        parameter,
        provider_type,
      },
    }),
  })
}
