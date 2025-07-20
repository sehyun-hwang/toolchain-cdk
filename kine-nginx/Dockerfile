FROM fullstorydev/grpcurl AS grpcurl
FROM nginx:alpine

COPY --from=grpcurl /bin/grpcurl /bin/
COPY nginx.conf /etc/nginx/conf.d/default.conf
