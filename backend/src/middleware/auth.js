function createAuthMiddleware({ User, jwt, httpError, secret }) {
  function authenticate(req, res, next) {
    const token = req.cookies.snooker_session;
    if (!token) return next(httpError(401, 'Please sign in to continue.'));

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return next(httpError(401, 'Your session has expired. Sign in again.'));
    }

    User.findByPk(payload.sub)
      .then((user) => {
        if (!user || !user.isActive) return next(httpError(401, 'Your session is no longer valid. Sign in again.'));
        req.user = user;
        return next();
      })
      .catch(next);
  }

  function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') return next(httpError(403, 'Administrator access is required.'));
    return next();
  }

  return { authenticate, requireAdmin };
}

module.exports = createAuthMiddleware;
