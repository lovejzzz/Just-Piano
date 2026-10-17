// Read a system math routine in this probe's own address space. No target attachment.
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <ptrauth.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
int main(int argc,char **argv){
 if(argc!=5){fprintf(stderr,"usage: symbol signed-relative-offset byte-count new-output\n");return 2;}
 char *end;errno=0;long long offset=strtoll(argv[2],&end,0);if(errno||*end||offset>16777216||offset< -16777216)return 2;
 errno=0;unsigned long count=strtoul(argv[3],&end,0);if(errno||*end||!count||count>65536)return 2;
 void *symbol=dlsym(RTLD_DEFAULT,argv[1]);if(!symbol){fprintf(stderr,"%s\n",dlerror());return 3;}
 uintptr_t address=(uintptr_t)ptrauth_strip(symbol,ptrauth_key_function_pointer),start=address+offset;
 Dl_info routine,first,last;if(!dladdr((void*)address,&routine)||!dladdr((void*)start,&first)||!dladdr((void*)(start+count-1),&last)||routine.dli_fbase!=first.dli_fbase||routine.dli_fbase!=last.dli_fbase){fprintf(stderr,"read must remain in the same loaded image\n");return 3;}
 int fd=open(argv[4],O_WRONLY|O_CREAT|O_EXCL,0600);if(fd<0){perror("new-output");return 4;}
 size_t written=0;while(written<count){ssize_t n=write(fd,(const char*)start+written,count-written);if(n<=0){perror("write");close(fd);return 5;}written+=(size_t)n;}if(close(fd)){perror("close");return 5;}
 printf("{\"symbol\":\"%s\",\"image\":\"%s\",\"imageBase\":\"0x%llx\",\"functionAddress\":\"0x%llx\",\"readAddress\":\"0x%llx\",\"relativeOffset\":%lld,\"bytes\":%lu,\"selfProcessOnly\":true}\n",argv[1],routine.dli_fname,(unsigned long long)(uintptr_t)routine.dli_fbase,(unsigned long long)address,(unsigned long long)start,offset,count);
 return 0;
}
