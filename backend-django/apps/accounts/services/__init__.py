"""Reserved: accounts domain services.

Domain/transactional logic (e.g. an auth service that issues session/tokens,
external-identity linking) lives here as plain callables operating on the
models layer. Views stay thin and delegate to services once logic grows beyond
a trivial serializer.save().
"""
