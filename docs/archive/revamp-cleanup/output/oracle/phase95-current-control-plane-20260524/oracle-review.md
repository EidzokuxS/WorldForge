I’ve identified a likely hard issue: restore staging lacks a crash-convergent journal/commit protocol, with DB/config/chat/vector changes applied sequentially before runtime authority invalidation.
