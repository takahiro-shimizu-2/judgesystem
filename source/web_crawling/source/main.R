library(DT)
library(pdftools)
library(parallel)
library(tidyr)
library(dplyr)

d1 <- read.table(
  "../output/_all_v3.txt",
  header=T,
  sep="\t",
  quote='',
  comment.char="",
  stringsAsFactors = F
)
table(d1$pdf_types)
d2 <- d1[d1$pdf_types=="その他",]

# cl <- makeCluster( detectCores() %/% 2 )

cl <- makeCluster( detectCores() )
clusterEvalQ(cl, library(pdftools))
system.time({
  #result <- lapply(d2[["save_path"]], function(path) {
  #  print(path)
  result <- parLapply(cl, d1[["save_path"]], function(path) {
    pdf_path <- file.path("..", path)
    if(!file.exists(pdf_path)){
      return("ファイル無し")
    }
    
    # テキスト抽出
    text <- pdf_text(pdf_path)
    text <- text[text!=""]
    tex2 <- text[1]
    if(is.na(tex2)){
      return(NA)
    }
    tex3 <- strsplit(tex2,"\n")[[1]]
    tex3 <- tex3[1:min(c(length(tex3),20))]
    tex3 <- gsub(" ","",tex3)
    
    hed <- tex3[1]
    
    if(grepl("入札公告",hed)){
      return("入札公告")
    }
    
    if(grepl("入札結果",hed)){
      return("入札結果")
    }
    
    if(0){
      if(grepl("入札公告",hed)){
        return("入札公告")
      }
  
      if(grepl("入札結果",hed)){
        return("入札結果")
      }
      
      if(grepl("^公告",hed)){
        return("公告")
      }
      
      if(grepl("仕様書",hed)){
        return("仕様書")
      }
      
      if(any(tex3=="公告")){
        return("公告")
      }
      
      if(any(tex3=="変更公告")){
        return("変更公告")
      }
      
      if(any(grepl("情報・提案要求書",tex3))){
        return("情報・提案要求書")
      }
      
      if(grepl("競争参加者の資格に関する公示",hed)){
        return("競争参加者の資格に関する公示")
      }
      
      if(grepl("仕様書番号",hed)){
        return("仕様書番号")
      }
      
      if(grepl("公示.*号",hed)){
        return("公示xx号")
      }
      
      if(grepl("見積依頼",hed)){
        return("見積依頼")
      }
      
      if(grepl("^支担官第.*号",hed)){
        return("支担官第xx号")
      }
      
      if(any(grepl("業者の選定",tex3))){
        return("業者の選定")
      }
    }
    
    return(hed)
  })
})
stopCluster(cl)

d1[["pdf_types_2"]] <- unlist(result)



if(0){
  pdfurl_subset_cols <- c("pdfUrl","pdf_types","pdf_types2")
  
  cl <- makeCluster( detectCores() %/% 2 )
  clusterEvalQ(cl, library(pdftools))
  system.time({
    #result <- lapply(d2[["save_path"]], function(path) {
    #  print(path)
    result <- parLapply(cl, d2[["save_path"]], function(path) {
      pdf_path <- file.path("..", path)
      
      # テキスト抽出
      text <- pdf_text(pdf_path)
      text <- text[text!=""]
      tex2 <- text[1]
      if(is.na(tex2)){
        return(NA)
      }
      hed <- gsub(" ","", strsplit(tex2,"\n")[[1]][1])
      tmp <- strsplit(tex2,"\n")[[1]]
      tex3 <- tmp[1:min(c(length(tmp),20))]
      
      if(grepl("^公告",hed)){
        return("公告")
      }
      
      if(grepl("仕様書",hed)){
        return("仕様書")
      }
      
      if(any(tex3=="公告")){
        return("公告")
      }
      
      if(any(tex3=="変更公告")){
        return("変更公告")
      }
      
      if(any(grepl("情報・提案要求書",tex3))){
        return("情報・提案要求書")
      }
      
      if(grepl("競争参加者の資格に関する公示",hed)){
        return("競争参加者の資格に関する公示")
      }
      
      if(grepl("仕様書番号",hed)){
        return("仕様書番号")
      }
      
      if(grepl("公示.*号",hed)){
        return("公示xx号")
      }
      
      if(grepl("見積依頼",hed)){
        return("見積依頼")
      }
      
      if(grepl("^支担官第.*号",hed)){
        return("支担官第xx号")
      }
      
      if(any(grepl("業者の選定",tex3))){
        return("業者の選定")
      }
      
      return(hed)
    })
  })
  # 約45分。
  #ユーザ システム     経過 
  #  1.80     1.45  2058.28
  stopCluster(cl)
  
  d2[["pdf_types2"]] <- unlist(result)
  
  d1[["pdf_types2"]] <- d2[["pdf_types2"]][match(d1$pdfUrl,d2$pdfUrl)]
  d1[["pdf_types2"]][is.na(d1[["pdf_types2"]])] <- d1[["pdf_types"]][is.na(d1[["pdf_types2"]])]
  
  ag <- data.frame(table(d1[["pdf_types2"]]))
  ag <- ag[order(ag[["Freq"]],decreasing = T),]
  
  wh1 <- which(d1[["pdf_types2"]]=="競争参加者の資格に関する公示")
  wh1 <- which(d1[["pdf_types2"]]=="公告")
  d1[(wh1[length(wh1)]-3):(wh1[length(wh1)]+1),]
  
  d2 <- d1[d1$index!=1,]
  
  d3 <- d2[,pdfurl_subset_cols]
  d3[!grepl("入札公告",d3$pdf_types),]
}


if(0){
  # pdfurl と department 確認。
  d1 <- read.table(
    "../output/_all_v1.txt",
    header=T,
    sep="\t",
    quote='',
    comment.char="",
    stringsAsFactors = F
  )
  ref <- read.table("../data/リスト_防衛省入札_1.txt",sep="\t",header=T,stringsAsFactors = F)
  
  d2 <- d1[,c("pdfUrl","topAgencyName","subAgencyName")]
  d2[["pdfUrl_"]] <- sub("^https?://", "", d2[["pdfUrl"]])
  
  
  # 階層数をカウント（"/" の数を数える）
  depth <- sapply(gregexpr("/", d2[["pdfUrl"]]), function(x) sum(x > 0)) 
  # 集計 
  table(depth)
  d2[["pdfUrl"]][depth==13]
  d2[["pdfUrl"]][depth==23]
  
  d2[["pdfUrl3"]] <- sapply(d2[["pdfUrl_"]], function(x,level){
    parts <- strsplit(x, "/")[[1]]
    paste(parts[1:level], collapse = "/")
  }, level=3)
  
  # 集計
  ag3 <- as.data.frame(table(d2[["pdfUrl3"]]))
  ag3 <- ag3[order(ag3[["Freq"]],decreasing = T),]
  d2[["pdfUrl3_freq"]] <- ag3[["Freq"]][match(d2[["pdfUrl3"]],ag3[["Var1"]])]
  unique(d2[,c("topAgencyName","subAgencyName","pdfUrl3")])
  
  geolist <- c(
    "yokohama","kitautunomiya","chitose","misawa","akita","matsushima",
    "niigata","hyakuri","ichigaya","meguro","fuchu","yokota","iruma",
    "kumagaya","shizuhama","hamamatsu","komaki","gifu","komatsu","miho",
    "hofukita","hofuminami","ashiya","kasuga","nyutabaru","naha",
    "hokkaido","tohoku","n-kanto","s-kanto","kinchu","tokai","chushi",
    "kyushu","okinawa"
  )
  d2[["pdfUrl3_geo"]] <- geolist[match(basename(d2[["pdfUrl3"]]),geolist)]
  unique(d2[,c("topAgencyName","subAgencyName","pdfUrl3","pdfUrl3_freq","pdfUrl3_geo")])
  
}



if(0){
  d1 <- read.table(
    "../output/_all_v3.txt",
    header=T,
    sep="\t",
    quote='',
    comment.char="",
    stringsAsFactors = F
  )
  ag <- data.frame(table(d1[["base_url"]], d1[["pdf_types"]]))
  
  ag_wide <- ag %>%
    pivot_wider(
      names_from = Var2,
      values_from = Freq
    )
  ag_wide <- as.data.frame(ag_wide)
  ag_wide <- ag_wide[order(ag_wide[["入札公告"]],decreasing = T),]
  
}



