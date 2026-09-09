class CapabilityError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        retryable: bool = False,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable


# Backwards-compatible name for callers that only handle Zhihu upstream errors.
ZhihuAPIError = CapabilityError
