import { getMpAccountName } from '~/server/utils/mp-account';

interface AccountNameQuery {
  url: string;
}

export default defineEventHandler(async event => {
  const { url } = getQuery<AccountNameQuery>(event);
  return getMpAccountName(url);
});
