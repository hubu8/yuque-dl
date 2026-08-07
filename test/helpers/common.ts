export function formatTitleWithUuid(item: {title: string, uuid: string}) {
  return `${item.title}_${item.uuid}`
}