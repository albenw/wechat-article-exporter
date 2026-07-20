import { searchMpAccountByUrl } from '~/server/utils/mp-account';

interface UrlQuery {
  url: string;
}

export default defineEventHandler(async event => searchMpAccountByUrl(event, getQuery<UrlQuery>(event).url));
