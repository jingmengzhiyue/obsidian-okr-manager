export const OKR_TYPE_OBJECTIVE = "objective";
export const OKR_TYPE_CHECK_IN = "check-in";

export const FRONTMATTER_OKR_TYPE = "okr-type";
export const FRONTMATTER_OKR_ID = "okr-id";
export const FRONTMATTER_OKR_PERIOD = "okr-period";
export const FRONTMATTER_OKR_PERIOD_TYPE = "okr-period-type";
export const FRONTMATTER_OKR_REF = "okr-ref";
export const FRONTMATTER_TITLE = "title";
export const FRONTMATTER_DESCRIPTION = "description";
export const FRONTMATTER_OWNER = "owner";
export const FRONTMATTER_STATUS = "status";
export const FRONTMATTER_PROGRESS = "progress";
export const FRONTMATTER_CURRENT = "current";
export const FRONTMATTER_TARGET = "target";
export const FRONTMATTER_UNIT = "unit";
export const FRONTMATTER_CONFIDENCE = "confidence";
export const FRONTMATTER_CREATED = "created";
export const FRONTMATTER_DUE = "due";
export const FRONTMATTER_DATE = "date";
export const FRONTMATTER_DELTA = "delta";
export const FRONTMATTER_NOTE = "note";
export const FRONTMATTER_BLOCKER = "blocker";
export const FRONTMATTER_TAGS = "tags";
export const FRONTMATTER_KEY_RESULTS = "key-results";

export const OKR_KR_LIST_START = "<!-- OKR-KR-LIST -->";
export const OKR_KR_LIST_END = "<!-- /OKR-KR-LIST -->";
export const OKR_CHECKINS_START = "<!-- OKR-CHECKINS-START -->";
export const OKR_CHECKINS_END = "<!-- OKR-CHECKINS-END -->";

export const DEFAULT_ROOT_DIR = "OKR";
export const DEFAULT_CHECKINS_DIR = "OKR/Check-ins";
export const CHECK_IN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const YEAR_PERIOD_PATTERN = /^\d{4}$/;
export const QUARTER_PERIOD_PATTERN = /^\d{4}-Q[1-4]$/;
export const MONTH_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const WEEK_PERIOD_PATTERN = /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/;
export const PERIOD_PATTERN =
	/^(\d{4}|\d{4}-Q[1-4]|\d{4}-(0[1-9]|1[0-2])|\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3]))$/;
export const OBJECTIVE_ID_PATTERN = /^O\d+$/;
export const KEY_RESULT_ID_PATTERN = /^O\d+-KR\d+$/;
