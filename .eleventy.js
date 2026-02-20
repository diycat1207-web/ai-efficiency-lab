module.exports = function(eleventyConfig) {
  // パススルーコピー（CSS、画像など）
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");

  // 日付フォーマットフィルター
  eleventyConfig.addFilter("dateFormat", function(date) {
    const d = new Date(date);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  });

  // 短い日付フォーマット
  eleventyConfig.addFilter("isoDate", function(date) {
    return new Date(date).toISOString().split('T')[0];
  });

  // 記事の抜粋を生成
  eleventyConfig.addFilter("excerpt", function(content) {
    if (!content) return '';
    const text = content.replace(/<[^>]+>/g, '');
    return text.substring(0, 160) + '...';
  });

  // コレクション: 全記事を日付順に
  eleventyConfig.addCollection("posts", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/**/*.md").sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
