const express = require('express')
const app = express()
const port = 3000

app.get('/tag/:slug', (req, res) => {
  res.send(JSON.parse(`{"tag" : " ${req.params.slug}","code" : "${(req.query.code)}" }`))
  console.log(req.query)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})